(function () {
  const root = document.getElementById('sample-projects-groups');
  if (!root || typeof SAMPLE_PROJECTS === 'undefined') return;

  const sceneMarkup = {
    voice: '<div class="wf-scene wf-voice"><span class="wf-avatar"></span><span class="wf-waveform"><i></i><i></i><i></i><i></i><i></i></span></div>',
    agent: '<div class="wf-scene wf-agent"><span class="wf-row"><i class="wf-dot"></i><span class="wf-bar"></span></span><span class="wf-row"><i class="wf-dot wf-dot-active"></i><span class="wf-bar wf-bar-wide"></span></span><span class="wf-row"><i class="wf-dot"></i><span class="wf-bar wf-bar-short"></span></span></div>',
    flow: '<div class="wf-scene wf-flow"><span class="wf-node"></span><span class="wf-arrow"></span><span class="wf-node"></span><span class="wf-arrow"></span><span class="wf-node"></span></div>',
    chat: '<div class="wf-scene wf-chat"><span class="wf-bubble wf-bubble-left"></span><span class="wf-bubble wf-bubble-right"></span><span class="wf-bubble wf-bubble-left wf-bubble-wide"></span></div>',
    app: '<div class="wf-scene wf-app"><span class="wf-stat"></span><span class="wf-stat"></span><span class="wf-stat"></span><span class="wf-tile"></span><span class="wf-tile"></span><span class="wf-tile"></span></div>',
  };

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function cardHtml(item, wireframe) {
    return `
      <div class="col-md-6 col-lg-4">
        <div class="sample-project-card">
          <div class="sample-browser-bar">
            <span class="sample-browser-controls"><i></i><i></i><i></i></span>
            <span class="sample-browser-address">${escapeHtml(item.domain)}</span>
          </div>
          <div class="sample-browser-viewport">${sceneMarkup[wireframe] || ''}</div>
          <div class="sample-project-body">
            <span class="sample-project-eyebrow">${escapeHtml(item.business)}</span>
            <h4>${escapeHtml(item.headline)}</h4>
            <p>${escapeHtml(item.description)}</p>
          </div>
        </div>
      </div>
    `;
  }

  root.innerHTML = SAMPLE_PROJECTS.map((group) => `
    <div class="sample-project-group">
      <div class="row mb-3">
        <div class="col-lg-8">
          <h3 class="sample-project-track">${escapeHtml(group.track)}</h3>
          <p class="text-muted-custom mb-0">${escapeHtml(group.groupNote)}</p>
        </div>
      </div>
      <div class="row g-4 mb-5">
        ${group.items.map((item) => cardHtml(item, group.wireframe)).join('')}
      </div>
    </div>
  `).join('');
})();
