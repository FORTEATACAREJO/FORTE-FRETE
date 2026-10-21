// App-owned browser history. No credentials, requests or business data live here.
export function createForteHistory({app,root,initial=root,onChange,canNavigate=()=>true,getRoot=()=>win.document.querySelector('main'),win=window}){
 const slot='forteNavigation',scroll=new Map();let guard=canNavigate,dirty=false,reverting=false,disposed=false;
 const valid=v=>typeof v==='string'&&v.length<=140&&!/[<>\r\n]/.test(v);
 const requested=new URL(win.location.href).searchParams.get('forte_view');
 let screen=valid(requested)?requested:initial;
 let entry=win.history.state?.[slot];
 const urlFor=value=>{const url=new URL(win.location.href);if(value===root)url.searchParams.delete('forte_view');else url.searchParams.set('forte_view',value);return url.pathname+url.search+url.hash;};
 const state=(value,index)=>({...win.history.state,[slot]:{app,screen:value,index}});
 if(entry?.app===app&&valid(entry.screen)&&Number.isSafeInteger(entry.index)){screen=entry.screen;}
 else{win.history.replaceState(state(root,0),'',urlFor(root));entry={app,screen:root,index:0};if(screen!==root){win.history.pushState(state(screen,1),'',urlFor(screen));entry={app,screen,index:1};}}
 const remember=()=>{const el=getRoot();scroll.set(screen,{x:win.scrollX||0,y:win.scrollY||0,top:el?.scrollTop||0,search:app==='frete'?[...(el?.querySelectorAll('input[type=search]')||[])].map(input=>({id:input.id,value:input.value})):[]});};
 const restore=()=>{const saved=scroll.get(screen);if(!saved)return;const schedule=win.requestAnimationFrame||((fn)=>win.setTimeout(fn,0));schedule(()=>schedule(()=>{if(disposed)return;win.scrollTo?.(saved.x,saved.y);const el=getRoot();if(el){for(const input of el.querySelectorAll('input[type=search]')){const prior=saved.search?.find(s=>s.id&&s.id===input.id);if(prior){input.value=prior.value;input.dispatchEvent(new win.Event('input',{bubbles:true}));}}el.scrollTop=saved.top;}}));};
 const leave=()=>!dirty||win.confirm('Há alterações no formulário. Deseja descartá-las e voltar?');
 const apply=(value,next)=>{screen=value;entry=next;dirty=false;onChange?.(value);restore();};
 function navigate(value,{replace=false,force=false}={}){
  if(!valid(value)||!guard(value))return false;if(value===screen)return true;
  if(!force&&!leave())return false;remember();const next={app,screen:value,index:replace?entry.index:entry.index+1};
  const nextState={...win.history.state,[slot]:next};for(const key of ['forteLayer','forteLayers','forteLayerStart','forteTabs','forteUIIndex'])delete nextState[key];win.history[replace||win.history.state?.forteLayer?'replaceState':'pushState'](nextState,'',urlFor(value));win.dispatchEvent(new win.Event('forte:navigate'));apply(value,next);return true;
 }
 const pop=event=>{const next=event.state?.[slot];if(next?.app!==app)return;if(reverting){reverting=false;event.stopImmediatePropagation();return;}if(next.screen===screen&&next.index===entry.index)return;
  if(!guard(next.screen)){remember();const fallback={app,screen:root,index:next.index};win.history.replaceState({...win.history.state,[slot]:fallback},'',urlFor(root));apply(root,fallback);return;}
  if(!leave()){event.stopImmediatePropagation();reverting=true;win.history.go(entry.index-next.index);return;}remember();apply(next.screen,next);
 };
 const input=event=>{const el=getRoot();if((!el?.contains(event.target)&&!event.target.closest('[role=dialog],.modalOverlay,.modal'))||event.target.type==='search')return;if(event.target.closest('form,[data-forte-draft],.ow,.sheet-editor'))dirty=true;};
 const unload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};
 const layerClose=event=>{if(!leave())event.preventDefault();else dirty=false;};
 win.addEventListener('forte:before-layer-close',layerClose);win.addEventListener('popstate',pop,true);win.addEventListener('beforeunload',unload);win.document.addEventListener('input',input);win.document.addEventListener('change',input);
 return {get screen(){return screen;},get canBack(){return entry.index>0;},navigate,back(){if(entry.index>0||win.history.state?.forteLayer||win.history.state?.forteUIIndex>0)win.history.back();else if(screen!==root)navigate(root,{replace:true});},setGuard(fn){guard=fn;},restore,markClean(){dirty=false;},markDirty(){dirty=true;},dispose(){disposed=true;scroll.clear();win.removeEventListener('forte:before-layer-close',layerClose);win.removeEventListener('popstate',pop,true);win.removeEventListener('beforeunload',unload);win.document.removeEventListener('input',input);win.document.removeEventListener('change',input);}};
}
