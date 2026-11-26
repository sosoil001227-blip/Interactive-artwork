import test from 'node:test'
import assert from 'node:assert/strict'
import { GroundedWalk } from '../src/walk.ts'

test('walking alternates swing feet while the stance footprint remains fixed on the floor', () => {
  const gait = new GroundedWalk(); let previous = gait.update(300,600,1,1/60)
  const lifted = [0,0]
  for(let i=1;i<260;i++) {
    const current = gait.update(300+i*1.5,600,1,1/60)
    for(let side=0;side<2;side++) {
      const foot=current.feet[side]!, old=previous.feet[side]!
      assert.ok(foot.y <= 600.001)
      if(foot.planted && old.planted) { assert.equal(foot.x,old.x); assert.equal(foot.y,600) }
      if(!foot.planted && foot.y<598) lifted[side]++
    }
    previous=current
  }
  assert.ok(lifted[0]!>30 && lifted[1]!>30)
})

test('stopping settles both feet; turns and short pauses never teleport a footprint', () => {
  const gait=new GroundedWalk(); let state=gait.update(300,600,1,1/60)
  for(let i=1;i<60;i++)state=gait.update(300+i*1.5,600,1,1/60)
  const x=388.5
  for(let i=0;i<60;i++)state=gait.update(x,600,1,1/60)
  assert.equal(state.moving,false);assert.ok(state.feet.every(foot=>foot.planted && foot.y===600))
  let previous=state
  for(let i=1;i<90;i++) {
    state=gait.update(x-i*1.5,600,1,1/60)
    state.feet.forEach((foot,side)=>assert.ok(Math.abs(foot.x-previous.feet[side]!.x)<13))
    previous=state
  }
})
