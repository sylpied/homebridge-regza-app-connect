(() => {
  const defaultInputs = [
    { name: '地デジ', key: '40BF7A', identifier: 1 },
    { name: 'BS', key: '40BF7C', identifier: 2 },
    { name: 'CS', key: '40BF7D', identifier: 3 },
    { name: 'HDMI（次のアクティブ入力）', key: '40BF3A', identifier: 4 },
  ];
  const newDevice = () => ({
    name: 'REGZA', ip: '', model: '55J10X', mac: '', username: '', password: '',
    protocol: 'https', port: 4430, allowSelfSignedCertificate: true,
    powerMode: 'discrete', powerOnKey: '40BF7E', powerOffKey: '40BF7F', powerToggleKey: '40BF12',
    enableWakeOnLan: false, wakeOnLanAddress: '192.168.100.255', wakeOnLanPort: 2304,
    powerOnDelaySeconds: 2, requestTimeoutMs: 5000, pollingInterval: 120,
    enableMutePowerProbe: true, powerProbeMode: 'operation', powerProbeInterval: 60,
    operationPowerOnThresholdSeconds: 30, stalePowerProbeHours: 8, operationCommandDelayMs: 250, selectKeyMode: 'guideFirst',
    navigationTimeoutSeconds: 60, navigationPostSelectResetSeconds: 15,
    contextualRemoteArrows: true, inputs: defaultInputs.map((input) => ({ ...input })),
  });
  const defaults = { platform: 'RegzaAppConnect', name: 'RegzaAppConnect', uiLanguage: 'auto', devices: [], debug: false };
  let config;
  let translations = {};
  let updateTimer;
  const byId = (id) => document.getElementById(id);
  const t = (key) => translations[key] || key;
  const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const input = (id, label, value, type = 'text', extra = '', help = '') => `
    <div class="form-group"><label class="form-label" for="${id}">${label}</label>
    <input id="${id}" class="form-control" type="${type}" value="${esc(value)}" ${extra}>
    ${help ? `<small class="regza-help text-muted">${help}</small>` : ''}</div>`;
  const select = (id, label, value, choices, help = '') => `
    <div class="form-group"><label class="form-label" for="${id}">${label}</label>
    <select id="${id}" class="form-select">${choices.map(([v, title]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${title}</option>`).join('')}</select>
    ${help ? `<small class="regza-help text-muted">${help}</small>` : ''}</div>`;
  const check = (id, label, value, help = '') => `
    <div class="form-check regza-wide"><input id="${id}" class="form-check-input" type="checkbox" ${value ? 'checked' : ''}>
    <label class="form-check-label" for="${id}">${label}</label>${help ? `<small class="regza-help text-muted">${help}</small>` : ''}</div>`;
  const section = (title, help, body, open = false) => `<details class="regza-section" ${open ? 'open' : ''}><summary>${title}</summary><div class="regza-section-body">${help ? `<p class="text-muted">${help}</p>` : ''}${body}</div></details>`;

  const renderDevice = (device, index) => {
    const p = `d${index}`;
    const basic = `<div class="regza-grid">
      ${input(`${p}-name`, t('tvName'), device.name)}
      ${select(`${p}-model`, t('model'), device.model || '55J10X', [['55J10X', t('j10x')], ['custom', t('custom')]])}
      ${input(`${p}-ip`, t('ip'), device.ip, 'text', 'placeholder="192.168.100.150"')}
      ${input(`${p}-mac`, t('mac'), device.mac, 'text', 'placeholder="5C:93:A2:DB:3C:E1"', t('macHelp'))}
      ${input(`${p}-username`, t('username'), device.username)}
      ${input(`${p}-password`, t('password'), device.password, 'password')}
    </div>`;
    const connection = `<div class="regza-grid">
      ${select(`${p}-protocol`, t('protocol'), device.protocol || 'https', [['https', 'HTTPS'], ['http', 'HTTP']])}
      ${input(`${p}-port`, t('port'), device.port, 'number', 'min="1" max="65535"')}
      ${check(`${p}-selfsigned`, t('selfSigned'), device.allowSelfSignedCertificate !== false, t('selfSignedHelp'))}
      ${input(`${p}-timeout`, t('requestTimeout'), device.requestTimeoutMs, 'number', 'min="1000" max="60000"')}
      ${input(`${p}-polling`, t('polling'), device.pollingInterval, 'number', 'min="120" max="3600"')}
    </div>`;
    const power = `<div class="regza-grid">
      ${select(`${p}-power-mode`, t('powerMode'), device.powerMode || 'discrete', [['discrete', t('discrete')], ['toggle', t('toggle')]])}
      <div></div>
      <div id="${p}-discrete" class="regza-grid regza-wide">
        ${input(`${p}-power-on`, t('powerOnKey'), device.powerOnKey)}
        ${input(`${p}-power-off`, t('powerOffKey'), device.powerOffKey)}
      </div>
      <div id="${p}-toggle" class="regza-wide">${input(`${p}-power-toggle`, t('powerToggleKey'), device.powerToggleKey)}</div>
      ${select(`${p}-probe-mode`, t('probeMode'), device.powerProbeMode || 'operation', [['operation', t('probeOperation')], ['interval', t('probeIntervalMode')], ['optimistic', t('probeOptimistic')]], t('muteProbeHelp'))}
      <div id="${p}-probe-options" class="regza-wide">${input(`${p}-probe-interval`, t('probeInterval'), device.powerProbeInterval, 'number', 'min="30" max="86400"')}</div>
      <div id="${p}-operation-wake-option" class="regza-wide">${input(`${p}-operation-wake`, t('operationWakeThreshold'), device.operationPowerOnThresholdSeconds ?? 30, 'number', 'min="0" max="3600"', t('operationWakeHelp'))}</div>
      ${input(`${p}-stale-probe`, t('staleProbeHours'), device.stalePowerProbeHours ?? 8, 'number', 'min="0.25" max="168" step="0.25"', t('staleProbeHelp'))}
      ${input(`${p}-command-delay`, t('operationCommandDelay'), device.operationCommandDelayMs ?? 250, 'number', 'min="100" max="5000"', t('operationCommandDelayHelp'))}
      ${check(`${p}-wol`, t('wol'), device.enableWakeOnLan === true, t('wolHelp'))}
      <div id="${p}-wol-options" class="regza-grid regza-wide">
        ${input(`${p}-wol-address`, t('wolAddress'), device.wakeOnLanAddress)}
        ${input(`${p}-wol-port`, t('wolPort'), device.wakeOnLanPort, 'number', 'min="0" max="65535"')}
        ${input(`${p}-wol-delay`, t('wolDelay'), device.powerOnDelaySeconds, 'number', 'min="0" max="60"')}
      </div>
    </div>`;
    const remote = `<div class="regza-grid">
      ${select(`${p}-select-mode`, t('selectMode'), device.selectKeyMode || 'guideFirst', [['guideFirst', t('guideFirst')], ['menuFirst', t('menuFirst')], ['quickFirst', t('quickFirst')], ['normal', t('normalSelect')]])}
      ${input(`${p}-nav-timeout`, t('navigationTimeout'), device.navigationTimeoutSeconds, 'number', 'min="5" max="3600"')}
      ${input(`${p}-post-select`, t('postSelectDelay'), device.navigationPostSelectResetSeconds, 'number', 'min="1" max="60"')}
      ${check(`${p}-context-arrows`, t('contextArrows'), device.contextualRemoteArrows !== false, t('contextArrowsHelp'))}
    </div>`;
    const inputs = `<div id="${p}-inputs"></div><button id="${p}-add-input" type="button" class="btn btn-outline-primary btn-sm">${t('addInput')}</button>`;
    return `<article class="regza-tv" data-index="${index}"><div class="regza-tv-header"><strong>${esc(device.name || t('unnamedTv'))}</strong><button class="btn btn-outline-danger btn-sm regza-remove-device" type="button">${t('removeTv')}</button></div>
      ${section(t('basic'), t('basicHelp'), basic, true)}
      ${section(t('connection'), t('connectionHelp'), connection)}
      ${section(t('power'), t('powerHelp'), power)}
      ${section(t('remote'), t('remoteHelp'), remote)}
      ${section(t('inputs'), t('inputsHelp'), inputs)}
      ${section(t('advanced'), '', `<div class="regza-advanced-note text-muted">${t('advancedNote')}</div>`)}</article>`;
  };

  const bindValue = (id, object, key, kind = 'text') => {
    const element = byId(id);
    if (!element) return;
    const event = kind === 'check' || element.tagName === 'SELECT' ? 'change' : 'input';
    element.addEventListener(event, () => {
      object[key] = kind === 'check' ? element.checked : kind === 'number' ? Number(element.value) : element.value;
      scheduleUpdate();
    });
  };
  const bindDevice = (device, index) => {
    const p = `d${index}`;
    [['name','name'],['model','model'],['ip','ip'],['mac','mac'],['username','username'],['password','password'],['protocol','protocol'],['power-mode','powerMode'],['power-on','powerOnKey'],['power-off','powerOffKey'],['power-toggle','powerToggleKey'],['probe-mode','powerProbeMode'],['wol-address','wakeOnLanAddress'],['select-mode','selectKeyMode']].forEach(([id,key]) => bindValue(`${p}-${id}`, device, key));
    [['port','port'],['timeout','requestTimeoutMs'],['polling','pollingInterval'],['probe-interval','powerProbeInterval'],['operation-wake','operationPowerOnThresholdSeconds'],['stale-probe','stalePowerProbeHours'],['command-delay','operationCommandDelayMs'],['wol-port','wakeOnLanPort'],['wol-delay','powerOnDelaySeconds'],['nav-timeout','navigationTimeoutSeconds'],['post-select','navigationPostSelectResetSeconds']].forEach(([id,key]) => bindValue(`${p}-${id}`, device, key, 'number'));
    [['selfsigned','allowSelfSignedCertificate'],['wol','enableWakeOnLan'],['context-arrows','contextualRemoteArrows']].forEach(([id,key]) => bindValue(`${p}-${id}`, device, key, 'check'));
    ['power-mode','probe-mode','wol'].forEach((id) => byId(`${p}-${id}`)?.addEventListener('change', () => updateConditional(device, index)));
    byId(`${p}-model`)?.addEventListener('change', () => { if (device.model === '55J10X') applyJ10x(device); render(); scheduleUpdate(); });
    document.querySelector(`[data-index="${index}"] .regza-remove-device`).onclick = () => { config.devices.splice(index, 1); render(); scheduleUpdate(); };
    byId(`${p}-add-input`).onclick = () => {
      const identifier = Math.max(0, ...device.inputs.map((item) => Number(item.identifier) || 0)) + 1;
      device.inputs.push({ name: 'HDMI', key: '40BF3A', identifier });
      renderInputs(device, index);
      scheduleUpdate();
    };
    renderInputs(device, index);
    updateConditional(device, index);
  };
  const applyJ10x = (d) => Object.assign(d, { protocol: 'https', port: 4430, allowSelfSignedCertificate: true, powerMode: 'discrete', powerOnKey: '40BF7E', powerOffKey: '40BF7F', powerToggleKey: '40BF12', pollingInterval: 120, enableMutePowerProbe: true, powerProbeMode: 'operation', powerProbeInterval: 60, operationPowerOnThresholdSeconds: 30, stalePowerProbeHours: 8, operationCommandDelayMs: 250 });
  const updateConditional = (device, index) => {
    const p = `d${index}`;
    byId(`${p}-discrete`)?.classList.toggle('d-none', device.powerMode !== 'discrete');
    byId(`${p}-toggle`)?.classList.toggle('d-none', device.powerMode !== 'toggle');
    byId(`${p}-operation-wake-option`)?.classList.toggle('d-none', device.powerMode !== 'discrete');
    byId(`${p}-probe-options`)?.classList.toggle('d-none', device.powerProbeMode !== 'interval');
    byId(`${p}-wol-options`)?.classList.toggle('d-none', device.enableWakeOnLan !== true);
    homebridge.fixScrollHeight?.();
  };
  const renderInputs = (device, index) => {
    const container = byId(`d${index}-inputs`); container.replaceChildren();
    device.inputs = Array.isArray(device.inputs) ? device.inputs : defaultInputs.map((i) => ({ ...i }));
    device.inputs.forEach((item, itemIndex) => {
      const row = document.createElement('div'); row.className = 'regza-input-row';
      row.innerHTML = `${input(`d${index}-i${itemIndex}-name`, t('inputName'), item.name)}${input(`d${index}-i${itemIndex}-key`, t('inputKey'), item.key)}${input(`d${index}-i${itemIndex}-id`, t('inputId'), item.identifier, 'number', 'min="1"')}<button type="button" class="btn btn-outline-danger btn-sm regza-danger">${t('remove')}</button>`;
      container.append(row);
      bindValue(`d${index}-i${itemIndex}-name`, item, 'name'); bindValue(`d${index}-i${itemIndex}-key`, item, 'key'); bindValue(`d${index}-i${itemIndex}-id`, item, 'identifier', 'number');
      row.querySelector('button').onclick = () => {
        device.inputs.splice(itemIndex, 1);
        renderInputs(device, index);
        scheduleUpdate();
      };
    });
  };
  const render = () => {
    byId('page-title').textContent = t('pageTitle'); byId('page-description').textContent = t('pageDescription'); byId('ui-language').value = config.uiLanguage;
    byId('devices').innerHTML = config.devices.map(renderDevice).join('');
    config.devices.forEach(bindDevice);
    byId('add-device').textContent = t('addTv'); byId('global-summary').textContent = t('global'); byId('debug-label').textContent = t('debug'); byId('debug').checked = Boolean(config.debug);
    byId('debug').onchange = (event) => { config.debug = event.target.checked; scheduleUpdate(); };
    byId('add-device').onclick = () => { config.devices.push(newDevice()); render(); scheduleUpdate(); };
    validateAndUpdate(); homebridge.fixScrollHeight?.();
  };
  const scheduleUpdate = () => { clearTimeout(updateTimer); updateTimer = setTimeout(validateAndUpdate, 150); };
  const validateAndUpdate = async () => {
    const valid = config.devices.length > 0 && config.devices.every((d) => d.name && d.ip && d.username && d.password);
    byId('status').textContent = valid ? '' : t('required'); byId('status').className = valid ? 'd-none' : 'alert alert-warning';
    valid ? homebridge.enableSaveButton?.() : homebridge.disableSaveButton?.();
    await homebridge.updatePluginConfig([config]);
  };
  const loadTranslations = async () => {
    const hbLanguage = typeof homebridge.i18nCurrentLang === 'function' ? await homebridge.i18nCurrentLang() : navigator.language;
    const language = config.uiLanguage === 'auto' ? ((hbLanguage || '').toLowerCase().startsWith('ja') ? 'ja' : 'en') : config.uiLanguage;
    try { const response = await fetch(`locales/${language}.json?v=0.7.4`); translations = response.ok ? await response.json() : {}; } catch { translations = {}; }
  };
  const init = async () => {
    const blocks = await homebridge.getPluginConfig().catch(() => []); config = { ...defaults, ...(blocks[0] || {}) }; config.devices = Array.isArray(config.devices) ? config.devices : [];
    config.devices.forEach((device) => {
      if (!device.powerProbeMode) device.powerProbeMode = device.enableMutePowerProbe === false ? 'optimistic' : 'operation';
      if (!device.pollingInterval || device.pollingInterval < 120) device.pollingInterval = 120;
    });
    await loadTranslations(); render();
    byId('ui-language').addEventListener('change', async (event) => { config.uiLanguage = event.target.value; await loadTranslations(); render(); scheduleUpdate(); });
  };
  homebridge.addEventListener('ready', () => void init().catch((error) => { byId('status').textContent = error.message; byId('status').className = 'alert alert-danger'; }));
})();
