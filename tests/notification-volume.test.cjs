'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {attenuateWav,playAdjustedWav}=require('../dist/notification-volume');

function wav(bits,format=1,extensible=false) {
  const width=bits/8, fmtSize=extensible?40:16, data=20+fmtSize+8;
  const b=Buffer.alloc(data+width*2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(fmtSize,16);
  b.writeUInt16LE(extensible?0xfffe:format,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);
  b.writeUInt32LE(48000*width,28);b.writeUInt16LE(width,32);b.writeUInt16LE(bits,34);
  if(extensible){b.writeUInt16LE(22,36);b.writeUInt16LE(bits,38);b.writeUInt16LE(format,44);Buffer.from('000000001000800000aa00389b71','hex').copy(b,46);}
  b.write('data',data-8);b.writeUInt32LE(width*2,data-4);
  return {b,data,width};
}

test('WAV gain handles unsigned PCM, signed PCM and floating samples without changing metadata or source',()=>{
  for(const [format,bits] of [[1,8],[1,16],[1,24],[1,32],[3,32],[3,64]]) for(const ext of [false,true]) {
    const {b,data,width}=wav(bits,format,ext);
    const write=(buffer,value,offset)=>format===3?(bits===32?buffer.writeFloatLE(value,offset):buffer.writeDoubleLE(value,offset)):bits===8?buffer.writeUInt8(value+128,offset):buffer.writeIntLE(value,offset,width);
    const read=(buffer,offset)=>format===3?(bits===32?buffer.readFloatLE(offset):buffer.readDoubleLE(offset)):bits===8?buffer[offset]-128:buffer.readIntLE(offset,width);
    const level=format===3?0.75:bits===8?100:10000;
    write(b,level,data);write(b,-level,data+width);const original=Buffer.from(b);
    const quieter=attenuateWav(b,0.5);
    assert.equal(read(quieter,data),level/2);assert.equal(read(quieter,data+width),-level/2);
    assert.deepEqual(quieter.subarray(0,data),b.subarray(0,data));assert.deepEqual(b,original);
    assert.deepEqual(attenuateWav(b,1),b);assert.equal(read(attenuateWav(b,0),data),0);
  }
});

test('invalid or compressed WAV data cannot fall through at full volume',()=>{
  for(const b of [Buffer.alloc(2),Buffer.from('RIFF'),wav(16,6).b,wav(16).b.subarray(0,30)]) assert.throws(()=>attenuateWav(b,0.5));
  for(const gain of [-1,2,NaN]) assert.throws(()=>attenuateWav(wav(16).b,gain));
});

test('ALSA temporary attenuation is removed after success, failure and thrown player errors',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'navigator-volume-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'original.wav'),original=wav(16).b;fs.writeFileSync(file,original);
  for(const outcome of ['success','failure','throw']) {
    let temporary;
    const result=await playAdjustedWav(file,50,async adjusted=>{
      temporary=adjusted;assert.notEqual(adjusted,file);assert.ok(fs.existsSync(adjusted));
      if(outcome==='throw')throw Error('unavailable');return outcome==='success';
    });
    assert.equal(result,outcome==='success');assert.equal(fs.existsSync(path.dirname(temporary)),false);
    assert.deepEqual(fs.readFileSync(file),original);
  }
  await playAdjustedWav(file,100,async adjusted=>{assert.equal(adjusted,file);return true;});
  fs.writeFileSync(file,'invalid');let calls=0;
  assert.equal(await playAdjustedWav(file,50,async()=>{calls++;return true;}),false);assert.equal(calls,0);
});
