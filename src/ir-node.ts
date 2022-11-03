import { remove } from 'lodash'

export enum OpCode {
  // effects
  Start,
  Return,
  Merge,
  If,
  IfTrue,
  IfFalse,

  _DUMMY_EFFECT_END,

  // ops
  Phi,
  IntConst,
  Add,
  Sub,
  ICmp,
  Load,
  Store,
}

export function isOpcodeEffect(o: OpCode) {
  return o < OpCode._DUMMY_EFFECT_END
}

export enum ICmp {
  Lt,
  Gt,
  Eq,
  Le,
  Ge,
  Ne,
}

export class IrNode {
  opcode: OpCode
  effect: Effect
  param_head?: Param
  param_tail?: Param
  n_param: number = 0
  use_head?: Param
  use_tail?: Param
  v: any

  constructor(opcode: OpCode, v?: any) {
    this.opcode = opcode
    this.v = v
    this.effect = new Effect()
  }

  chainEffect(after: IrNode) {
    after.effect.next.push(this)
    if (this.opcode != OpCode.Merge) {
      this.effect.prev = [after]
    } else {
      this.effect.prev.push(after)
    }
  }

  addParam(node: IrNode) {
    let param = new Param(node, this)
    if (this.param_head == undefined) {
      this.param_head = this.param_tail = param
    } else {
      param.param_prev = this.param_tail
      this.param_tail!.param_next = param
      this.param_tail = param
    }
    if (node.use_head == undefined) {
      node.use_head = node.use_tail = param
    } else {
      param.use_prev = node.use_tail
      node.use_tail!.use_next = param
      node.use_tail = param
    }
    this.n_param++
  }

  getParam(n: number) {
    if (n >= this.n_param) {
      throw new Error('Invalid param number')
    }
    let it = this.param_head
    for (let i = 0; i < n; i++) {
      it = it?.param_next
    }
    return it
  }

  replaceMeWith(node: IrNode) {
    let use = this.use_head
    while (use != undefined) {
      use.node = node
      if (node.use_head == undefined) {
        node.use_head = node.use_tail = use
      } else {
        use.use_prev = node.use_tail
        node.use_tail!.use_next = use
        node.use_tail = use
      }
      use = use.use_next
    }
    this.use_tail = this.use_head = undefined
  }
}

export class Param {
  belong_node: IrNode
  node: IrNode
  param_next?: Param
  param_prev?: Param
  use_next?: Param
  use_prev?: Param

  constructor(node: IrNode, belong_node: IrNode) {
    this.node = node
    this.belong_node = belong_node
  }
}

export class Effect {
  prev: IrNode[]
  next: IrNode[]

  constructor() {
    this.prev = []
    this.next = []
  }
}

export class NodeDumper {
  idx = 0
  param_idx = 0
  node_idx = new Map<IrNode, number>()
  param_ids = new Map<Param, number>()
  dumped = new Set<IrNode>()
  q: IrNode[] = []
  s = ''

  beginDump(start: IrNode) {
    this.s += 'digraph nodes {\n'
    this.s += 'graph [newrank=true, ranksep=1]'
    this.s += 'node [shape=record, minheight=0.02]\n'
    this.dumpNodes(start)
    this.dumpEdges(start)
    this.s += '}'
    return this.s
  }

  dumpNodes(start: IrNode) {
    this.q.push(start)
    let effect_subgraph = ''
    let data_subgraph = ''
    while (this.q.length > 0) {
      let n = this.q.pop()!
      if (this.dumped.has(n)) continue
      this.dumped.add(n)

      let s = this.drawNode(n)
      if (isOpcodeEffect(n.opcode)) {
        effect_subgraph += s
      } else {
        data_subgraph += s
      }

      this.pushNodeNext(n)
    }
    this.s += `
    subgraph cluster {
      node [color=blue]
${effect_subgraph}
    }
    
${data_subgraph}
    
    `
  }

  dumpEdges(start: IrNode) {
    this.q = []
    this.dumped.clear()
    this.q.push(start)
    while (this.q.length > 0) {
      let n = this.q.pop()!
      if (this.dumped.has(n)) continue
      this.dumped.add(n)

      // dump effect edges
      for (let eff of n.effect.prev) {
        let constraint: string[] = ['color=blue']

        let target = this.nodeIdStr(n)
        if (n.opcode == OpCode.Merge) {
          target += ':e' + this.nodeIdStr(eff)
        }
        this.s += `${this.nodeIdStr(eff)}:c -> ${target} [${constraint.join(',')}]\n`
      }

      let it = n.param_head
      while (it != undefined) {
        let constraint: string[] = []

        if (n.opcode == OpCode.Phi) {
          // back edges pointing to phi should not constrain
        }

        this.s += `${this.nodeIdStr(it.node)}:c -> ${this.nodeIdStr(n)}:${this.paramIdStr(
          it
        )} [${constraint.join(',')}]\n`

        it = it.param_next
      }

      this.pushNodeNext(n)
    }
  }

  private pushNodeNext(n: IrNode) {
    let it = n.param_head
    while (it != undefined) {
      this.q.push(it.node)
      it = it.param_next
    }

    for (let m of n.effect.next) {
      this.q.push(m)
    }
  }

  nodeIdStr(n: IrNode): string {
    return 'n' + this.nodeId(n)
  }

  paramIdStr(p: Param): string {
    return 'p' + this.paramId(p)
  }

  nodeId(n: IrNode): number {
    if (this.node_idx.has(n)) return this.node_idx.get(n)!
    else {
      let m = this.idx++
      this.node_idx.set(n, m)
      return m
    }
  }

  paramId(n: Param): number {
    if (this.param_ids.has(n)) return this.param_ids.get(n)!
    else {
      let m = this.param_idx++
      this.param_ids.set(n, m)
      return m
    }
  }

  drawNode(n: IrNode) {
    let label = this.nodeIdStr(n)
    let left_boxes: string[] = []
    let right_boxes: string[] = []
    if (n.opcode == OpCode.Merge) {
      for (let source of n.effect.prev) {
        left_boxes.push('<e' + this.nodeIdStr(source) + '>')
      }
    }
    let it = n.param_head
    while (it != undefined) {
      let id = this.paramId(it)
      right_boxes.push('<p' + id + '>')
      it = it.param_next
    }
    let print_label = ''
    if (left_boxes.length != 0) print_label += left_boxes.join('|') + '|'
    print_label += '<c>' + label
    print_label += '|' + Object.values(OpCode)[n.opcode]
    if (n.v != undefined) print_label += '|' + n.v
    if (right_boxes.length != 0) print_label += '|' + right_boxes.join('|')

    let options: string[] = []
    options.push('label="${print_label}"')
    if (n.opcode == OpCode.Start) {
      options.push('rank=min')
    } else if (n.opcode == OpCode.Return) {
      options.push('rank=max')
    }

    return `${label} [label="${print_label}"]\n`
  }
}
