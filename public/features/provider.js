export function setup(ui) {
  ui.on('settings', async ({root}) => {
    const section = document.createElement('section');
    section.innerHTML = '<h2>ChatGPT connection</h2><p class="connection-state" role="status"></p><a class="connect" data-oai-siwc-button target="_blank" rel="noopener noreferrer">Continue with ChatGPT</a> <button class="test-passage">Try a short passage</button><p>Connect from the browser on your Docker host. <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">View plan usage</a></p><p class="passage-result" aria-live="polite"></p>';
    root.append(section);
    const status = section.querySelector('.connection-state');
    const check = async () => {
      try {
        const info = await ui.api('/api/provider/status');
        status.textContent = info.connected ? 'Connected to your ChatGPT plan.' : 'Connect your plan to generate a story.';
        section.querySelector('.connect').href = info.hostSignIn;
      } catch(error) { status.textContent = error.message; }
    };
    const button = section.querySelector('.test-passage');
    button.onclick = async () => {
      const result = section.querySelector('.passage-result');
      button.disabled = true;
      result.textContent = 'Generating a passage…';
      try {
        const {entries} = await ui.api('/api/provider/passage',{});
        result.replaceChildren(...entries.map(({kind,text}) => {
          const entry = document.createElement('span');
          entry.dataset.kind = kind;
          entry.lang = 'zh-Hans';
          entry.textContent = text;
          return entry;
        }));
        await check();
      } catch(error) { result.textContent = error.message; }
      finally { button.disabled = false; }
    };
    await check();
    const label=ui.el('label','Story text model ');
    const select=ui.el('select');
    const result=ui.el('p');result.setAttribute('role','status');
    label.append(select);section.append(label,result);
    try{
      const {selected,models}=await ui.api('/api/provider/models');
      for(const value of new Set(['',...models,selected])){
        const option=ui.el('option',value||'Automatic (first available)');
        option.value=value;select.append(option);
      }
      select.value=selected;
      select.disabled=!models.length&&!selected;
      let saved=selected;
      select.onchange=async()=>{
        select.disabled=true;
        try{await ui.api('/api/provider/models',{model:select.value});saved=select.value;result.textContent='Text model saved.';}
        catch(error){select.value=saved;result.textContent=error.message;}
        finally{select.disabled=false;}
      };
    }catch(error){select.disabled=true;result.textContent=error.message;}
  });
}
