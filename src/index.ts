import { ICmp, IrNode, NodeDumper, OpCode } from './ir-node'

let start = new IrNode(OpCode.Start)
let ret = new IrNode(OpCode.Return)

/*
    let i = 0
    let sum = 0
    while (i < 100) {
        sum = sum + i
        i = i + 1
    }
    return sum
 */

let i_init = new IrNode(OpCode.IntConst, 0)
let sum_init = new IrNode(OpCode.IntConst, 0)

let loop_start = new IrNode(OpCode.Merge)
loop_start.chainEffect(start)

let i_merge = new IrNode(OpCode.Phi)
i_merge.addParam(loop_start)
i_merge.addParam(i_init)

let sum_merge = new IrNode(OpCode.Phi)
sum_merge.addParam(loop_start)
sum_merge.addParam(sum_init)

let cmp_item = new IrNode(OpCode.IntConst, 100)
let loop_cmp = new IrNode(OpCode.ICmp, ICmp.Lt)
loop_cmp.addParam(i_merge)
loop_cmp.addParam(cmp_item)

let while_head = new IrNode(OpCode.If)
while_head.addParam(loop_cmp)
while_head.chainEffect(loop_start)

let while_true = new IrNode(OpCode.IfTrue)
while_true.chainEffect(while_head)

let sum_add = new IrNode(OpCode.Add)
sum_add.addParam(sum_merge)
sum_add.addParam(i_merge)

let i_next = new IrNode(OpCode.Add)
i_next.addParam(i_merge)
i_next.addParam(new IrNode(OpCode.IntConst, 1))

loop_start.chainEffect(while_true)
i_merge.addParam(i_next)
sum_merge.addParam(sum_add)

let while_next = new IrNode(OpCode.IfFalse)
while_next.chainEffect(while_head)

ret.addParam(sum_merge)
ret.chainEffect(while_next)

let dumper = new NodeDumper()
let res = dumper.beginDump(start)
console.log(res)
