'use strict';
function createNavigatorColour(api) {
  const page = document.getElementById('colourPage'), chats = document.getElementById('chatPage');
  const presets = ['#E45B65', '#E58C42', '#C8AC36', '#4EA876', '#35A7AE', '#6B8AFD', '#A37DE0', '#D66BAD'];
  let state, selected, lastSwatch, finishing = false, hue = 225, saturation = 0.6, value = 1, previousFocus;
  const byId = id => page.querySelector('#colour-' + id);
  function normalise(text) {
    if (typeof text !== 'string') return;
    text = text.trim();
    if (/^#[0-9a-f]{3}$/i.test(text)) text = '#' + [...text.slice(1)].map(x => x + x).join('');
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
  }
  function fromHSV(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = v - c;
    const rgb = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
    return '#' + rgb.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function toHSV(hex) {
    const [r,g,b] = hex.slice(1).match(/../g).map(x => parseInt(x,16) / 255), max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
    value = max; saturation = max ? d/max : 0;
    if (d) hue = ((max === r ? (g-b)/d : max === g ? (b-r)/d+2 : (r-g)/d+4)*60+360)%360;
  }
  function render(sync = true) {
    const effective = selected === 'none' ? undefined : normalise(selected) ?? normalise(state.inherited);
    if (sync && selected !== undefined) { toHSV(effective ?? '#6B8AFD'); byId('hex').value = normalise(selected) ?? ''; }
    byId('native').value = effective ?? '#6B8AFD';
    byId('native').classList.toggle('no-colour', !effective);
    byId('native').title = effective ? 'System colour picker' : 'No colour selected. Open the system colour picker.';
    byId('preview').style.color = effective ?? '';
    byId('apply').disabled = selected === undefined;
    byId('hex').setAttribute('aria-invalid', String(selected === undefined));
    byId('hex').title = selected === undefined ? 'Enter #RGB or #RRGGBB' : 'Hex colour';
    byId('hue').value = hue;
    byId('sv').style.backgroundColor = fromHSV(hue,1,1);
    byId('cursor').style.left = saturation*100 + '%'; byId('cursor').style.top = (1-value)*100 + '%';
    byId('sv').setAttribute('aria-valuenow', String(Math.round(saturation*100)));
    byId('sv').setAttribute('aria-valuetext', `Saturation ${Math.round(saturation*100)}%, brightness ${Math.round(value*100)}%`);
    for (const button of page.querySelectorAll('[data-colour]')) button.setAttribute('aria-pressed', String(button.dataset.colour === selected));
    byId('reset').setAttribute('aria-pressed', String(selected === null));
    byId('none').setAttribute('aria-pressed', String(selected === 'none'));
  }
  function select(hex) { lastSwatch = undefined; selected = hex; render(); }
  function hsvChanged() { lastSwatch = undefined; selected = fromHSV(hue,saturation,value); byId('hex').value = selected; render(false); }
  function finish(cancel) {
    if (!state || finishing) return;
    finishing = true;
    api.postMessage({ type: 'colourResult', token: state.token, colour: selected, cancel });
  }
  function swatches(container, colours, title) {
    const group = document.createElement('div'); group.className = 'colour-swatches'; group.setAttribute('role','group'); group.setAttribute('aria-label',title); group.title = title;
    for (const colour of [...new Set(colours.map(normalise).filter(Boolean))].slice(0,24)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'colour-swatch'; button.dataset.colour = colour;
      button.style.backgroundColor = colour; button.title = title + ': ' + colour; button.setAttribute('aria-label',button.title);
      button.addEventListener('click', () => {
        if (lastSwatch === colour && selected === colour) { finish(false); return; }
        select(colour); lastSwatch = colour;
      }); group.append(button);
    }
    container.append(group);
  }
  page.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); finish(true); }
    if (event.key === 'Enter' && event.target === byId('hex') && selected !== undefined) finish(false);
  });
  return {
    get active() { return !!state; },
    open(options) {
      if (!state) previousFocus = document.activeElement?.dataset?.focus;
      state = options; lastSwatch = undefined; finishing = false;
      selected = options.allowNone && options.initialNone ? 'none' : normalise(options.initial) ?? null;
      chats.hidden = true; page.hidden = false; page.classList.remove('custom-colour');
      page.innerHTML = `<div class="colour-heading"><button id="colour-back" aria-label="Back to chats">←</button><span id="colour-target"></span><button id="colour-custom" aria-expanded="false">Custom</button></div>
        <div class="colour-content"><div id="colour-palette"></div><div id="colour-custom-area" hidden><div id="colour-sv" tabindex="0" role="slider" aria-label="Saturation and brightness; use arrow keys" aria-valuemin="0" aria-valuemax="100"><span id="colour-cursor"></span></div><input id="colour-hue" type="range" min="0" max="359" aria-label="Hue"></div></div>
        <div class="colour-footer"><input id="colour-native" type="color" aria-label="System colour picker"><input id="colour-hex" type="text" maxlength="7" placeholder="#RRGGBB" aria-label="Hex colour" spellcheck="false"><span id="colour-preview" title="Colour preview">Label ★</span><button id="colour-reset"></button><button id="colour-none" hidden>No colour</button><button id="colour-cancel">Cancel</button><button id="colour-apply">Apply</button></div>`;
      byId('target').textContent = options.title; byId('target').title = options.title;
      byId('reset').textContent = options.resetLabel; byId('reset').title = options.inherited ? 'Inherited: '+options.inherited : 'Clear the custom colour and use the default text colour.';
      swatches(byId('palette'), presets, 'Presets');
      // A fuller palette includes both bright and muted variations of every hue.
      swatches(byId('palette'), Array.from({length:24}, (_,i) => fromHSV(i%12*30, i<12 ? 0.65 : 0.35, i<12 ? 0.95 : 0.7)), 'More colours');
      if (options.recent?.length) swatches(byId('palette'), options.recent, 'Recently used');
      if (options.repositories?.length) swatches(byId('palette'), options.repositories, 'Repository colours');
      byId('custom').onclick = () => {
        lastSwatch = undefined;
        const custom = byId('custom-area'); custom.hidden = !custom.hidden; byId('palette').hidden = !custom.hidden;
        page.classList.toggle('custom-colour', !custom.hidden);
        byId('custom').textContent = custom.hidden ? 'Custom' : 'Presets'; byId('custom').setAttribute('aria-expanded',String(!custom.hidden));
      };
      byId('hex').oninput = () => { lastSwatch = undefined; selected = normalise(byId('hex').value); if (selected) toHSV(selected); render(false); };
      byId('native').oninput = () => select(normalise(byId('native').value));
      byId('hue').oninput = () => { hue = Number(byId('hue').value); hsvChanged(); };
      const sv = byId('sv');
      function point(event) { const r=sv.getBoundingClientRect(); saturation=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)); value=1-Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)); hsvChanged(); }
      sv.onpointerdown = event => { sv.setPointerCapture(event.pointerId); point(event); };
      sv.onpointermove = event => { if (sv.hasPointerCapture(event.pointerId)) point(event); };
      sv.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
        event.preventDefault(); const step=event.shiftKey ? 0.1 : 0.01;
        saturation=Math.max(0,Math.min(1,saturation+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0)));
        value=Math.max(0,Math.min(1,value+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0))); hsvChanged();
      };
      byId('none').hidden = !options.allowNone; byId('none').onclick = () => select('none');
      byId('reset').onclick = () => select(null); byId('back').onclick = byId('cancel').onclick = () => finish(true);
      byId('apply').onclick = () => { if (selected !== undefined) finish(false); };
      render(); byId('hex').focus();
    },
    close(returnPage = 'chatPage') {
      state = undefined; page.hidden = true; chats.hidden = returnPage !== 'chatPage';
      document.getElementById(returnPage).hidden = false;
      requestAnimationFrame(() => {
        if (returnPage !== 'chatPage') { document.getElementById('repositoryBack').focus(); return; }
        const target = [...chats.querySelectorAll('[data-focus]')].find(el => el.dataset.focus === previousFocus);
        (target || document.getElementById('viewport')).focus({preventScroll:true});
      });
    }
  };
}
