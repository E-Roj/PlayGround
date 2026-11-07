(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const areas = [
    {name:'Pinewood Meadow', short:'PINEWOOD MEADOW', distance:30, wind:[-1,5], color:['#b8c6a9','#d6d5aa','#6e8968','#415b45'], reward:1, cost:0},
    {name:'Sunstone Canyon', short:'SUNSTONE CANYON', distance:55, wind:[-3,7], color:['#e4b98d','#efcf9d','#c18760','#865b49'], reward:2, cost:12},
    {name:'Frostline Ridge', short:'FROSTLINE RIDGE', distance:80, wind:[-6,5], color:['#c1d5d4','#e8e4d7','#879fa0','#667b7c'], reward:3, cost:35},
    {name:'Golden Dunes', short:'GOLDEN DUNES', distance:110, wind:[-8,8], color:['#d9b786','#e9d29f','#bd9156','#9a7045'], reward:5, cost:80}
  ];
  const bows = ['Willow longbow','Ash recurve','Yew warbow','Ranger’s bow','Elderwood bow'];
  const arrows = ['Pine shaft','Cedar flight','Ash feather','Carbon swift','Eagle-fletch'];
  const defaultSave = {coins:0,bow:1,arrow:1,reload:1,area:0,shots:0,hits:0,best:0};
  let save = {...defaultSave};
  try { save = {...save,...JSON.parse(localStorage.getItem('windWillowSave') || '{}')}; } catch(e) {}
  const windDirections = [
    {x:1,y:0,label:'RIGHT'},
    {x:.5,y:Math.sqrt(3)/2,label:'DOWN-RIGHT'},
    {x:-.5,y:Math.sqrt(3)/2,label:'DOWN-LEFT'},
    {x:-1,y:0,label:'LEFT'},
    {x:-.5,y:-Math.sqrt(3)/2,label:'UP-LEFT'},
    {x:.5,y:-Math.sqrt(3)/2,label:'UP-RIGHT'}
  ];
  let currentWind = 4.2, windDir = windDirections[0], windTick = 0, aim = {x:0,y:0}, dimensions={w:800,h:500,dpr:1}, target={x:0,y:0,r:85};
  let shotArrow = null, lastResult = null, toastTimer, resultTimer, animationFrame;
  let stickPointer = null, stickVector = {x:0,y:0}, stickStableSince = 0, stickStableAnchor = {x:0,y:0}, keyboardAimSince = 0, reloadUntil = 0, reloadTimer = 0;
  const aimStabilityMs = 550, aimStabilityTolerance = .075;
  let soundOn = true, audioContext = null, masterGain = null, musicTimer = null, musicStep = 0;
  let challengeActive = false, lastShotWasChallenge = false;

  function persist(){ localStorage.setItem('windWillowSave',JSON.stringify(save)); }
  function updateUI(){
    $('coin-count').textContent=save.coins; $('area-title').innerHTML=areas[save.area].name.replace(' ', ' <em>')+'</em>';
    $('area-label').textContent=`AREA 0${save.area+1} / 04`; $('distance').textContent=areas[save.area].distance;
    $('bow-name').textContent=bows[Math.min(save.bow-1,bows.length-1)]; $('arrow-name').textContent=arrows[Math.min(save.arrow-1,arrows.length-1)];
    $('bow-stat').innerHTML=`STABILITY <b>${Math.round((1-Math.max(.28,1-(save.bow-1)*.18))*100)}%</b> <span>·</span> POWER <b>0${save.bow}</b>`;
    $('arrow-stat').innerHTML=`WIND RESIST <b>${Math.round((1-Math.max(.25,1-(save.arrow-1)*.19))*100)}%</b> <span>·</span> FLIGHT <b>0${save.arrow}</b>`;
    $('reload-stat').innerHTML=`RELOAD <b>${reloadDuration(save.reload).toFixed(1)}s</b> <span>·</span> LEVEL <b>0${save.reload}</b>`;
    $('bow-cost').textContent=save.bow>=5?'MAX':`${upgradeCost(save.bow)} ◉`; $('arrow-cost').textContent=save.arrow>=5?'MAX':`${upgradeCost(save.arrow)} ◉`;
    $('reload-cost').textContent=save.reload>=5?'MAX':`${upgradeCost(save.reload,'reload')} ◉`;
    $('upgrade-bow').disabled=save.bow>=5||save.coins<upgradeCost(save.bow); $('upgrade-arrow').disabled=save.arrow>=5||save.coins<upgradeCost(save.arrow);
    $('upgrade-reload').disabled=save.reload>=5||save.coins<upgradeCost(save.reload,'reload');
    $('shot-count').textContent=`SHOT ${String(save.shots%6+1).padStart(2,'0')}`; $('round-count').textContent=`ROUND ${String(Math.floor(save.shots/6)+1).padStart(2,'0')}`;
    $('best-score').textContent=save.best?`${save.best}%`:'—'; $('accuracy-value').textContent=save.shots?`${Math.round(save.hits/save.shots*100)}%`:'—'; $('accuracy-fill').style.width=save.shots?`${Math.round(save.hits/save.shots*100)}%`:'0%';
    $('wind-speed').textContent=currentWind.toFixed(1); $('wind-arrow').style.transform=`rotate(${Math.atan2(windDir.y,windDir.x)*180/Math.PI}deg)`; $('wind-fill').style.width=`${Math.min(100,currentWind*10)}%`;
    $('wind-direction').textContent=`WIND · ${windDir.label}`;
    $('distance').textContent=areas[save.area].distance;
    const area=areas[save.area], challengeReward=area.reward*10;
    $('challenge-eyebrow').textContent=challengeActive?'HIGH-WIND CHALLENGE':"TODAY'S CHALLENGE";
    $('challenge-title').innerHTML=challengeActive?'Find the <em>center.</em>':'Make it <em>count.</em>';
    $('challenge-mark').textContent=challengeActive?'LIVE':'01';
    $('challenge-mark').classList.toggle('challenge-live',challengeActive);
    $('challenge-copy').textContent=challengeActive?`GUSTING WINDS! Bull’s-eye earns ${challengeReward} coins; other hits earn none.`:`Hit the rings to earn coins. Find the center for ${area.reward*3} coins.`;
    $('reward-hit').innerHTML=`+${challengeActive?'0':area.reward} <small>coin${area.reward===1&&!challengeActive?'':'s'}</small>`;
    $('reward-bull').innerHTML=`+${area.reward*(challengeActive?10:3)} <small>coins</small>`;
    $('sound-button').textContent=soundOn?'♫':'♩';
    $('sound-button').setAttribute('aria-pressed',String(soundOn));
    $('sound-button').setAttribute('aria-label',soundOn?'Turn music and sound off':'Turn music and sound on');
    updateReloadUI();
  }
  function upgradeCost(level,type){return level*(type==='reload'?8:5);}
  function reloadDuration(level){return Math.max(.85,2.4-(level-1)*.38);}
  function updateReloadUI(){
    const now=performance.now(), remaining=Math.max(0,reloadUntil-now), duration=reloadDuration(save.reload)*1000;
    const ready=remaining<=0;
    $('shoot-status').textContent=ready?'READY TO DRAW':'RELOADING';
    $('reload-countdown').textContent=ready?'BOW READY':`READY IN ${(remaining/1000).toFixed(1)}s`;
    $('reload-fill').style.transform=`scaleX(${ready?1:1-remaining/duration})`;
    $('shoot-controls').classList.toggle('reloading',!ready);
    aimPad.classList.toggle('disabled',!ready||!!shotArrow);
  }
  function resize(){
    const rect=canvas.getBoundingClientRect(); if(!rect.width||!rect.height)return;
    const dpr=Math.min(window.devicePixelRatio||1,2); dimensions={w:rect.width,h:rect.height,dpr};
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height, distanceFactor=Math.sqrt(areas[save.area].distance/30);
    target={x:w*.635,y:h*.49,r:Math.min(w*.111,h*.19)/distanceFactor};
    draw();
  }
  function draw(){
    const {w,h}=dimensions;if(!w||!h)return;
    const palette=areas[save.area].color, scale=w/800;
    const sky=ctx.createLinearGradient(0,0,0,h*.72);sky.addColorStop(0,palette[0]);sky.addColorStop(.64,palette[1]);sky.addColorStop(1,'#e3dcb9');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    // soft haze and sun
    ctx.fillStyle='#fff5d929';ctx.beginPath();ctx.arc(w*.17,h*.21,45*scale,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff6d97a';ctx.beginPath();ctx.arc(w*.17,h*.21,24*scale,0,Math.PI*2);ctx.fill();
    mountainLayer(w,h,palette[2],.42,.16,.13,0); mountainLayer(w,h,palette[3],.53,.22,.12,1);
    // far tree line
    ctx.fillStyle=palette[3]+'b5';for(let i=0;i<27;i++){let x=i*w/25+(i%3)*3,y=h*.51+(i%4)*2;pine(x,y,7*scale,18*scale,ctx.fillStyle)}
    // ground perspective
    let ground=ctx.createLinearGradient(0,h*.53,0,h);ground.addColorStop(0,'#82916d');ground.addColorStop(.45,palette[2]);ground.addColorStop(1,palette[3]);ctx.fillStyle=ground;ctx.beginPath();ctx.moveTo(0,h*.52);ctx.lineTo(w,h*.52);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
    // rolling banks
    ctx.fillStyle=palette[2]+'cc';ctx.beginPath();ctx.moveTo(0,h*.66);ctx.quadraticCurveTo(w*.22,h*.51,w*.45,h*.68);ctx.quadraticCurveTo(w*.72,h*.76,w,h*.57);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
    // distant scattered evergreens
    for(let i=0;i<18;i++){const x=((i*173+71)%w),y=h*(.53+(i%5)*.045),s=(.35+(i%4)*.17)*scale;pine(x,y,8*s,20*s,i%2?palette[3]:'#627b5d')}
    // shooting lane path, perspective
    ctx.fillStyle='#e2d9bd88';ctx.beginPath();ctx.moveTo(w*.43,h);ctx.lineTo(w*.57,h);ctx.lineTo(w*.625,h*.55);ctx.lineTo(w*.59,h*.55);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#efe6c780';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w*.5,h);ctx.lineTo(w*.605,h*.56);ctx.stroke();
    // foreground grasses
    for(let i=0;i<40;i++){const x=(i*89+12)%w,y=h*(.77+(i%7)*.035);ctx.strokeStyle=i%2?'#314f39a0':'#c3c28c9a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+5);ctx.quadraticCurveTo(x+(i%2?5:-5),y-6,x+(i%2?7:-7),y-13);ctx.stroke()}
    drawWind(w,h,scale);
    drawTarget(w,h,scale);
    // floating range markers
    ctx.strokeStyle='#f8f3da60';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(target.x,target.y+target.r*1.1);ctx.lineTo(target.x,h*.88);ctx.stroke();ctx.setLineDash([]);
    // reticle
    const rx=target.x+aim.x,ry=target.y+aim.y;
    ctx.strokeStyle='#fffdf0dd';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(rx,ry,8,0,Math.PI*2);ctx.moveTo(rx-13,ry);ctx.lineTo(rx-4,ry);ctx.moveTo(rx+4,ry);ctx.lineTo(rx+13,ry);ctx.moveTo(rx,ry-13);ctx.lineTo(rx,ry-4);ctx.moveTo(rx,ry+4);ctx.lineTo(rx,ry+13);ctx.stroke();
    ctx.fillStyle='#fffdf0';ctx.beginPath();ctx.arc(rx,ry,1.3,0,Math.PI*2);ctx.fill();
    if(shotArrow){drawFlyingArrow(shotArrow);}
    // bow silhouette on the lower left
    drawBow(w,h,scale);
  }
  function mountainLayer(w,h,color,base,amp,phase,variant){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,h*base);for(let x=0;x<=w;x+=w/8){let y=h*(base-amp*(.3+Math.abs(Math.sin(x/w*Math.PI*2+phase))*((x/w*5%1)*.7+.3)));ctx.lineTo(x,y)}ctx.lineTo(w,h*.59);ctx.lineTo(0,h*.59);ctx.closePath();ctx.fill();}
  function pine(x,y,width,height,color){ctx.fillStyle=color;ctx.fillRect(x-width*.09,y-height*.1,width*.18,height*.22);ctx.beginPath();ctx.moveTo(x,y-height);ctx.lineTo(x-width*.55,y-height*.34);ctx.lineTo(x-width*.22,y-height*.4);ctx.lineTo(x-width*.72,y-height*.05);ctx.lineTo(x+width*.72,y-height*.05);ctx.lineTo(x+width*.22,y-height*.4);ctx.lineTo(x+width*.55,y-height*.34);ctx.closePath();ctx.fill();}
  function drawWind(w,h,scale){
    const speed=Math.abs(currentWind), phase=performance.now()*.000018*(.45+speed*.11), direction=windDir;
    ctx.save();ctx.lineCap='round';
    for(let i=0;i<24;i++){
      const laneX=((i*.6180339887)%1), laneY=((i*.7548776662)%1);
      const x=(((laneX+phase*direction.x*.55)%1+1)%1)*w;
      const y=(((laneY+phase*direction.y*.55)%1+1)%1)*h+Math.sin(phase*4+i*1.7)*5*scale;
      const length=(8+Math.min(speed,8)*2.1)*(i%4===0?1.5:1)*scale;
      ctx.globalAlpha=.12+(i%3)*.035;ctx.strokeStyle=i%4===0?'#fff9e2':'#eef4d9';ctx.lineWidth=(i%4===0?1.4:.8)*scale;
      ctx.beginPath();ctx.moveTo(x-direction.x*length,y-direction.y*length);ctx.quadraticCurveTo(x-direction.x*length*.45,y-direction.y*length*.45,x,y);ctx.stroke();
      if(i%3===0){ctx.globalAlpha=.24;ctx.fillStyle='#fff9e2';ctx.beginPath();ctx.arc(x,y,1.15*scale,0,Math.PI*2);ctx.fill()}
    }
    ctx.restore();
  }
  function drawTarget(w,h,scale){
    const {x,y,r}=target;
    // stand and ground shadow
    ctx.fillStyle='#293c2d45';ctx.beginPath();ctx.ellipse(x,y+r*1.55,r*1.5,r*.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#735438';ctx.fillRect(x-r*.075,y+r*.73,r*.15,h*.37);ctx.fillStyle='#a98252';ctx.fillRect(x-r*.045,y+r*.75,r*.045,h*.34);
    // stand braces
    ctx.strokeStyle='#634b35';ctx.lineWidth=3*scale;ctx.beginPath();ctx.moveTo(x-r*.06,y+r*1.05);ctx.lineTo(x-r*.52,y+r*1.55);ctx.moveTo(x+r*.06,y+r*1.05);ctx.lineTo(x+r*.53,y+r*1.55);ctx.stroke();
    // layered timber rim and vibrant scoring rings
    ctx.fillStyle='#553b2b';ctx.beginPath();ctx.ellipse(x,y,r*1.1,r*1.1,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#bd9862';ctx.beginPath();ctx.ellipse(x,y,r*1.035,r*1.035,0,0,Math.PI*2);ctx.fill();
    const rings=['#f3ead2','#52745c','#e5b34f','#f4e8cc','#c75f48','#f1dfb8'];
    for(let i=0;i<rings.length;i++){let rr=r*(.92-i*.145);ctx.fillStyle=rings[i];ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);ctx.fill();ctx.strokeStyle=i%2?'#344d3b88':'#fff7e2aa';ctx.lineWidth=.9*scale;ctx.stroke()}
    // fine scoring ticks on the outer face
    ctx.save();ctx.strokeStyle='#3e513d99';ctx.lineWidth=.8*scale;
    for(let i=0;i<24;i++){const a=i*Math.PI/12,inner=r*.93,outer=r*(i%3===0?1:.965);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*inner,y+Math.sin(a)*inner);ctx.lineTo(x+Math.cos(a)*outer,y+Math.sin(a)*outer);ctx.stroke()}
    ctx.restore();
    ctx.fillStyle='#efb83f';ctx.beginPath();ctx.arc(x,y,r*.115,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff4c4';ctx.lineWidth=1.4*scale;ctx.stroke();
    // softly lit edge and subtle grain
    ctx.strokeStyle='#fff8dc99';ctx.lineWidth=1.5*scale;ctx.beginPath();ctx.ellipse(x,y,r*1.02,r*1.02,-.08,Math.PI*1.03,Math.PI*1.9);ctx.stroke();
    if(lastResult&&lastResult.visible){ctx.fillStyle='#242d2133';ctx.beginPath();ctx.arc(lastResult.x,lastResult.y,2.1,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#282d24';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(lastResult.x-5,lastResult.y);ctx.lineTo(lastResult.x+5,lastResult.y);ctx.stroke()}
  }
  function drawBow(w,h,s){ctx.save();ctx.globalAlpha=.77;ctx.strokeStyle='#342e24';ctx.lineWidth=6*s;ctx.beginPath();ctx.moveTo(w*.065,h*1.04);ctx.quadraticCurveTo(w*.17,h*.78,w*.095,h*.58);ctx.quadraticCurveTo(w*.055,h*.46,w*.14,h*.43);ctx.stroke();ctx.strokeStyle='#bd9862';ctx.lineWidth=3.6*s;ctx.beginPath();ctx.moveTo(w*.065,h*1.04);ctx.quadraticCurveTo(w*.17,h*.78,w*.095,h*.58);ctx.quadraticCurveTo(w*.055,h*.46,w*.14,h*.43);ctx.stroke();ctx.strokeStyle='#eee6d0';ctx.lineWidth=1*s;ctx.beginPath();ctx.moveTo(w*.065,h*1.04);ctx.lineTo(w*.14,h*.43);ctx.stroke();ctx.restore()}
  function drawFlyingArrow(a){const p=Math.min(1,(performance.now()-a.start)/a.duration),ease=1-Math.pow(1-p,3),x=a.fromX+(a.x-a.fromX)*ease,y=a.fromY+(a.y-a.fromY)*ease-Math.sin(p*Math.PI)*35*(dimensions.w/800);ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(a.y-a.fromY,a.x-a.fromX));ctx.strokeStyle='#432e1f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-20,0);ctx.lineTo(7,0);ctx.stroke();ctx.fillStyle='#d5c6a2';ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(4,-3);ctx.lineTo(4,3);ctx.fill();ctx.fillStyle='#e7e1cc';ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(-21,-4);ctx.lineTo(-18,0);ctx.lineTo(-21,4);ctx.closePath();ctx.fill();ctx.restore();if(p>=1){shotArrow=null;completeShot(a);draw()}}

  const aimPad=$('aim-pad'), padKnob=$('pad-knob');
  function updateStick(e){
    if(stickPointer!==e.pointerId||shotArrow||performance.now()<reloadUntil)return;
    const r=aimPad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=(r.width-44)/2;
    let x=e.clientX-cx,y=e.clientY-cy,len=Math.hypot(x,y);
    if(len>max){x=x/len*max;y=y/len*max}
    stickVector={x:x/max,y:y/max};
    if(Math.hypot(stickVector.x-stickStableAnchor.x,stickVector.y-stickStableAnchor.y)>aimStabilityTolerance){
      stickStableAnchor={...stickVector};stickStableSince=performance.now();
    }
    padKnob.style.transform=`translate(${x}px,${y}px)`;
    const reach=target.r*1.35;aim={x:stickVector.x*reach,y:stickVector.y*reach};
    $('scene-hint').classList.add('hidden');updateAimFeedback();draw();
  }
  function updateAimFeedback(){
    if(stickPointer===null&&!keyboardAimSince)return;
    const elapsed=performance.now()-(keyboardAimSince||stickStableSince),stable=elapsed>=aimStabilityMs;
    $('shoot-tip').textContent=stable?'STEADY · RELEASE TO SHOOT':`HOLD STEADY · ${Math.max(0,(aimStabilityMs-elapsed)/1000).toFixed(1)}s`;
    aimPad.classList.toggle('aim-stable',stable);
  }
  aimPad.addEventListener('pointerdown',e=>{
    if(shotArrow||performance.now()<reloadUntil||stickPointer!==null||keyboardAimSince)return;
    e.preventDefault();stickPointer=e.pointerId;stickStableSince=performance.now();stickStableAnchor={x:0,y:0};
    aimPad.setPointerCapture(e.pointerId);updateStick(e);
  });
  aimPad.addEventListener('pointermove',e=>{
    if(stickPointer!==e.pointerId)return;
    updateStick(e);
  });
  function releaseStick(e,canceled=false){
    if(stickPointer!==e.pointerId)return;
    e.preventDefault();if(!canceled)updateStick(e);
    const fire=!canceled&&performance.now()-stickStableSince>=aimStabilityMs;
    stickPointer=null;stickStableSince=0;aimPad.classList.remove('aim-stable');
    $('shoot-tip').textContent='MOVE THE D-PAD TO AIM · HOLD STEADY · RELEASE TO SHOOT';
    if(aimPad.hasPointerCapture(e.pointerId))aimPad.releasePointerCapture(e.pointerId);
    if(fire)shoot();else if(!canceled)toast('Hold your aim steady for a moment, then release.');
  }
  aimPad.addEventListener('pointerup',e=>releaseStick(e));
  aimPad.addEventListener('pointercancel',e=>releaseStick(e,true));
  aimPad.addEventListener('lostpointercapture',e=>{if(stickPointer===e.pointerId){stickPointer=null;stickStableSince=0;aimPad.classList.remove('aim-stable');$('shoot-tip').textContent='MOVE THE D-PAD TO AIM · HOLD STEADY · RELEASE TO SHOOT'}});
  aimPad.addEventListener('keydown',e=>{
    if((e.key===' '||e.key==='Enter')&&!e.repeat){
      e.preventDefault();
      if(shotArrow||performance.now()<reloadUntil||stickPointer!==null||keyboardAimSince)return;
      keyboardAimSince=performance.now();updateAimFeedback();
    }
  });
  aimPad.addEventListener('keyup',e=>{
    if((e.key===' '||e.key==='Enter')&&keyboardAimSince){
      e.preventDefault();const fire=performance.now()-keyboardAimSince>=aimStabilityMs;
      keyboardAimSince=0;aimPad.classList.remove('aim-stable');$('shoot-tip').textContent='MOVE THE D-PAD TO AIM · HOLD STEADY · RELEASE TO SHOOT';
      if(fire)shoot();else toast('Hold your aim steady for a moment, then release.');
    }
  });
  window.addEventListener('blur',()=>{keyboardAimSince=0;aimPad.classList.remove('aim-stable');$('shoot-tip').textContent='MOVE THE D-PAD TO AIM · HOLD STEADY · RELEASE TO SHOOT'});
  function shoot(){
    if(shotArrow||performance.now()<reloadUntil){updateReloadUI();return}
    const area=areas[save.area], bowSteadiness=Math.max(.28,1-(save.bow-1)*.18), arrowDrift=Math.max(.25,1-(save.arrow-1)*.19);
    const windDrift=currentWind*(area.distance/30)*2.05*arrowDrift;
    const spread=9.5*bowSteadiness*Math.max(.48,1-(save.arrow-1)*.13);
    const wobbleX=(Math.random()-.5)*spread, wobbleY=(Math.random()-.5)*spread;
    const hitX=target.x+aim.x+windDir.x*windDrift+wobbleX, hitY=target.y+aim.y+windDir.y*windDrift+wobbleY;
    const wasChallenge=challengeActive;
    if(wasChallenge)lastShotWasChallenge=true;
    else if(lastShotWasChallenge)lastShotWasChallenge=false;
    challengeActive=false;
    shotArrow={x:hitX,y:hitY,fromX:dimensions.w*.115,fromY:dimensions.h*.72,start:performance.now(),duration:(580+area.distance*2.7)*(1-(save.bow-1)*.055),hit:true,windDrift,challenge:wasChallenge};
    aim={x:0,y:0};stickVector={x:0,y:0};padKnob.style.transform='translate(0,0)';
    reloadUntil=performance.now()+reloadDuration(save.reload)*1000;
    $('scene-hint').classList.add('hidden');updateUI();
    $('shot-flash').classList.remove('active');void $('shot-flash').offsetWidth;$('shot-flash').classList.add('active');playSound('release');
    requestAnimationFrame(draw);
  }
  function completeShot(a){
    const dx=a.x-target.x,dy=a.y-target.y,dist=Math.hypot(dx,dy),ratio=dist/target.r;
    const bull=ratio<=.12, hit=ratio<=.91;
    save.shots++;let reward=0;
    if(hit){save.hits++;if(a.challenge){if(bull)reward=areas[save.area].reward*10}else reward=areas[save.area].reward*(bull?3:1);save.coins+=reward;}
    const accuracy=Math.max(0,Math.round((1-Math.min(1,ratio))*100));save.best=Math.max(save.best,accuracy);persist();
    lastResult={x:a.x,y:a.y,visible:true};
    const stamp=$('result-stamp');$('result-icon').textContent=hit?(bull?'✦':'◉'):'↗';$('result-title').textContent=bull?"BULL'S-EYE!":hit?'ON TARGET':'JUST WIDE';
    $('result-subtitle').textContent=bull?`PERFECT SHOT · +${reward} COINS`:hit?`NICE SHOT · +${reward} COIN${reward===1?'':'S'}`:'THE WIND GOT THIS ONE';
    stamp.classList.add('visible');clearTimeout(resultTimer);resultTimer=setTimeout(()=>{stamp.classList.remove('visible');if(lastResult)lastResult.visible=false;draw()},1900);
    updateUI();
    if(hit){playSound(bull?'bull':'hit');toast(a.challenge?(bull?`Challenge bull’s-eye! +${reward} coins`:'Challenge hit—but only a bull’s-eye earns the bonus.'):(bull?`Bull’s-eye! Hooray! +${reward} coins`:`On target! +${reward} coin${reward===1?'':'s'}`))}else{playSound('miss');toast(a.challenge?'Challenge missed. The gusts won this round.':'A little wide. Read the wind and try again.')}
    draw();
  }
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100)}
  function ensureAudio(){
    if(!audioContext){audioContext=new(window.AudioContext||window.webkitAudioContext)();masterGain=audioContext.createGain();masterGain.gain.value=0;masterGain.connect(audioContext.destination)}
    if(audioContext.state==='suspended')audioContext.resume();
    masterGain.gain.cancelScheduledValues(audioContext.currentTime);masterGain.gain.setTargetAtTime(.72,audioContext.currentTime,.08);
    return audioContext;
  }
  function tone(freq,duration,opts={}){
    const ac=audioContext;if(!ac)return;const osc=ac.createOscillator(),gain=ac.createGain();
    osc.type=opts.type||'triangle';osc.frequency.setValueAtTime(freq,ac.currentTime);
    if(opts.endFreq)osc.frequency.exponentialRampToValueAtTime(opts.endFreq,ac.currentTime+duration);
    gain.gain.setValueAtTime(opts.volume??.12,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);
    osc.connect(gain);gain.connect(masterGain);osc.start();osc.stop(ac.currentTime+duration);
  }
  function noise(duration,volume,swell=false){
    const ac=audioContext;if(!ac)return;const length=Math.ceil(ac.sampleRate*duration),buffer=ac.createBuffer(1,length,ac.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(swell?Math.sin(Math.PI*i/length):1);
    const source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=swell?1600:900;gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);gain.connect(masterGain);source.start();
  }
  function playSound(type){
    if(!soundOn)return;ensureAudio();
    if(type==='release'){tone(210,.12,{endFreq:95,volume:.16});tone(540,.08,{endFreq:300,volume:.055})}
    if(type==='hit'){noise(.12,.22);tone(175,.16,{endFreq:85,volume:.2});tone(740,.09,{volume:.06})}
    if(type==='miss'){tone(260,.16,{endFreq:150,volume:.09})}
    if(type==='bull'){
      noise(.9,.2,true);tone(196,.52,{endFreq:390,type:'sawtooth',volume:.055});
      [523,659,784,1047].forEach((n,i)=>setTimeout(()=>tone(n,.48,{volume:.11}),i*115));
      [392,494,587].forEach(n=>tone(n,.72,{volume:.045}));
    }
    if(type==='upgrade'){tone(520,.12,{volume:.1});setTimeout(()=>tone(780,.18,{volume:.1}),90)}
  }
  const musicThemes=[
    {notes:[392,494,587,494,440,587,659,587,392,494,587,784,659,587,494,440],type:'triangle',tempo:700},
    {notes:[330,392,494,392,294,370,440,370,330,392,494,587,494,440,392,330],type:'sine',tempo:610},
    {notes:[523,659,784,659,587,784,880,784,523,659,784,988,880,784,659,587],type:'sine',tempo:760},
    {notes:[293,370,440,370,330,440,494,440,293,370,440,587,494,440,370,330],type:'triangle',tempo:560}
  ];
  function playMusicNote(){if(!soundOn||!audioContext)return;const theme=musicThemes[save.area],n=theme.notes[musicStep%theme.notes.length];tone(n,.54,{volume:.035,type:theme.type});if(musicStep%4===0)tone(n/2,.78,{volume:.025,type:'sine'});musicStep++}
  function startMusic(){if(!soundOn)return;ensureAudio();clearInterval(musicTimer);musicStep=0;playMusicNote();musicTimer=setInterval(playMusicNote,musicThemes[save.area].tempo)}
  function stopMusic(){clearInterval(musicTimer);musicTimer=null;if(masterGain&&audioContext){masterGain.gain.cancelScheduledValues(audioContext.currentTime);masterGain.gain.setTargetAtTime(0,audioContext.currentTime,.08)}}
  function unlockMusic(){if(soundOn)startMusic();document.removeEventListener('pointerdown',unlockMusic);document.removeEventListener('keydown',unlockMusic)}
  document.addEventListener('pointerdown',unlockMusic);
  document.addEventListener('keydown',unlockMusic);
  $('sound-button').addEventListener('click',()=>{
    soundOn=!soundOn;updateUI();
    if(soundOn){startMusic();toast('Music & sound on')}
    else{stopMusic();toast('Sound off')}
  });

  function openModal(title,copy,content){$('modal-title').innerHTML=title;$('modal-copy').textContent=copy;$('modal-content').innerHTML=content;$('modal-backdrop').classList.add('open')}
  function closeModal(){$('modal-backdrop').classList.remove('open')}
  $('modal-close').addEventListener('click',closeModal);$('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))closeModal()});
  $('area-button').addEventListener('click',showAreas);
  $('reset-button').addEventListener('click',()=>openModal('Begin <em>again?</em>','This clears your coins, unlocked ranges, gear upgrades, and session scores. This cannot be undone.','<button class="modal-action" id="confirm-reset">RESET ALL PROGRESS</button><button class="modal-secondary" id="cancel-reset">KEEP PLAYING</button>'));
  function showAreas(){
    const content=`<div class="area-list">${areas.map((a,i)=>{const unlocked=i<=save.area;return `<button class="area-option ${unlocked?'':'locked'}" data-area="${i}"><span class="area-thumb"></span><span><strong>${a.name}</strong><small>${a.distance} METERS · ${a.reward}× REWARD</small></span><span class="area-price">${unlocked?(i===save.area?'PLAYING':'OPEN'):`🔒 ${a.cost} ◉`}</span></button>`}).join('')}</div>`;
    openModal('Choose your <em>ground.</em>','Every range brings a new distance, a new breeze, and a bigger reward.',content);
    document.querySelectorAll('.area-option').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.area);if(i<=save.area){changeArea(i);closeModal();return}const cost=areas[i].cost;if(save.coins>=cost){save.coins-=cost;changeArea(i);persist();updateUI();closeModal();toast(`${areas[i].name} unlocked!`)}else toast(`You need ${cost-save.coins} more coins to unlock this range.`)}));
  }
  function changeArea(i){save.area=i;aim={x:0,y:0};stickVector={x:0,y:0};padKnob.style.transform='translate(0,0)';windTick=0;musicStep=0;setWind();updateUI();resize();if(soundOn&&audioContext)startMusic();toast(`Welcome to ${areas[i].name}`)}
  $('help-button').addEventListener('click',()=>openModal('Find your <em>focus.</em>','A quiet hand, a little patience, and a good read of the breeze.',`<ol class="help-list"><li><b>Move the D-pad</b> to steer your aim. Hold your chosen direction steady for about half a second; the prompt will confirm when it is steady.</li><li><b>Release the D-pad</b> to shoot. A quick or unsteady touch will not fire; your aim stays put so you can try again. The controls lock while the arrow flies and the bow reloads.</li><li>The wind can blow in <b>six directions</b>. Aim against the arrow to compensate. Each region has its own music theme.</li><li>Land in the gold center for <b>${areas[save.area].reward*3} coins</b>. Occasional high-wind challenge shots pay <b>${areas[save.area].reward*10} coins</b> for a bull’s-eye only. Bow upgrades reduce wobble; arrow upgrades strongly resist wind. Quick nock shortens reloads.</li><li>Use <b>Reset Game</b> to clear your saved progress and start over.</li></ol><button class="modal-action" id="got-it">BACK TO THE RANGE</button>`));
  document.addEventListener('click',e=>{if(e.target.id==='got-it'||e.target.id==='cancel-reset')closeModal();if(e.target.id==='confirm-reset')resetGame()});
  $('upgrade-bow').addEventListener('click',()=>buyUpgrade('bow'));$('upgrade-arrow').addEventListener('click',()=>buyUpgrade('arrow'));$('upgrade-reload').addEventListener('click',()=>buyUpgrade('reload'));
  function resetGame(){save={...defaultSave};persist();shotArrow=null;lastResult=null;reloadUntil=0;aim={x:0,y:0};stickVector={x:0,y:0};stickPointer=null;keyboardAimSince=0;padKnob.style.transform='translate(0,0)';$('result-stamp').classList.remove('visible');challengeActive=false;lastShotWasChallenge=false;windTick=0;musicStep=0;closeModal();setWind();updateUI();resize();if(soundOn&&audioContext)startMusic();toast('Progress reset. A fresh range awaits.')}
  function buyUpgrade(type){
const level=save[type],cost=upgradeCost(level,type);if(level>=5)return;if(save.coins<cost){toast(`You need ${cost-save.coins} more coins.`);return}save.coins-=cost;save[type]++;persist();updateUI();draw();toast(`${type==='bow'?'Bow':type==='arrow'?'Arrow':'Reload'} upgraded to level ${save[type]}!`);playSound('upgrade')}
  function setWind(){const range=areas[save.area].wind;challengeActive=!lastShotWasChallenge&&Math.random()<.16;if(challengeActive)currentWind=+(7.5+Math.random()*2.5).toFixed(1);else currentWind=+Math.abs(Math.random()*(range[1]-range[0])+range[0]).toFixed(1);windDir=windDirections[Math.floor(Math.random()*windDirections.length)];updateUI()}
  function animate(){if(!shotArrow){windTick+=1/60;if(windTick>13){windTick=0;setWind()} }updateAimFeedback();updateReloadUI();draw();animationFrame=requestAnimationFrame(animate)}
  window.addEventListener('resize',resize,{passive:true});
  updateUI();resize();animate();
})();
