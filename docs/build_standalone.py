#!/usr/bin/env python
"""
Standalone Graphics.h Compiler - single-file builder.
Removes: save/unsave, demo selector, home button, autocomplete.
Keeps:   ace editor + monokai(dark)/textmate(light) themes, run, theme toggle,
         JetBrains Mono font (embedded base64, fully offline), GitHub link button.
Minifies CSS to reduce size.
"""
import base64, os, re, zlib

BASE = os.path.dirname(os.path.abspath(__file__))

def read_text(p):
    with open(p, 'r', encoding='utf-8', errors='replace') as f: return f.read()

def read_b64(p):
    with open(p, 'rb') as f: return base64.b64encode(f.read()).decode('ascii')

def b64_of_text(t):
    return base64.b64encode(t.encode('utf-8')).decode('ascii')

def safe_js(s):
    return s.replace('</script', '<\\/script')

def bt_escape(s):
    return s.replace('\\','\\\\').replace('`','\\`').replace('${','\\${')

def minify_css(css):
    # Remove block comments
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
    # Collapse whitespace
    css = re.sub(r'\s+', ' ', css)
    # Remove spaces around structural chars
    css = re.sub(r'\s*([{};:,>~+])\s*', r'\1', css)
    # Remove spaces after ( and before )
    css = re.sub(r'\(\s+', '(', css)
    css = re.sub(r'\s+\)', ')', css)
    # Remove last semicolon before }
    css = css.replace(';}', '}')
    # Remove leading zeros from decimals (0.3 → .3)
    css = re.sub(r'(?<![#\w])0(\.\d)', r'\1', css)
    # Shorten #rrggbb to #rgb where all pairs match
    def try_short(m):
        h = m.group(1).lower()
        if h[0] == h[1] and h[2] == h[3] and h[4] == h[5]:
            return '#' + h[0] + h[2] + h[4]
        return m.group(0)
    css = re.sub(r'#([0-9a-fA-F]{6})\b', try_short, css)
    return css.strip()

def minify_js(code):
    """Strip comments and collapse blank lines from inline JS."""
    result = []
    i = 0; n = len(code)
    in_sq = in_dq = in_tq = False
    while i < n:
        c = code[i]
        if c == '`' and not in_sq and not in_dq:
            in_tq = not in_tq; result.append(c); i += 1; continue
        if in_tq:
            result.append(c); i += 1; continue
        if c == "'" and not in_dq:
            in_sq = not in_sq; result.append(c); i += 1; continue
        if in_sq:
            if c == '\\': result.append(c); result.append(code[i+1]); i += 2; continue
            result.append(c); i += 1; continue
        if c == '"' and not in_sq:
            in_dq = not in_dq; result.append(c); i += 1; continue
        if in_dq:
            if c == '\\': result.append(c); result.append(code[i+1]); i += 2; continue
            result.append(c); i += 1; continue
        if c == '/' and i+1 < n and code[i+1] == '/':
            while i < n and code[i] != '\n': i += 1
            continue
        if c == '/' and i+1 < n and code[i+1] == '*':
            i += 2
            while i+1 < n and not (code[i] == '*' and code[i+1] == '/'): i += 1
            i += 2; result.append(' '); continue
        result.append(c); i += 1
    code = ''.join(result)
    code = re.sub(r'\n{3,}', '\n\n', code)
    code = '\n'.join(line.rstrip() for line in code.split('\n'))
    return code.strip()

# Selectors for elements that no longer exist in the HTML
REMOVED_SELECTORS = [
    '#save-btn', '.save-indicator', '#save-text', '#save-indicator',
    '.demo-selector', '.demo-dropdown', '#demo-select', '#back-btn',
    '.btn-home',
]

def strip_unused_css_rules(css):
    """Remove CSS rule blocks whose selectors reference removed elements."""
    removed = set(REMOVED_SELECTORS)
    result = []
    i = 0
    while i < len(css):
        # Find next {
        brace = css.find('{', i)
        if brace == -1:
            result.append(css[i:])
            break
        selector_block = css[i:brace]
        # Find matching closing }
        depth = 0
        j = brace
        while j < len(css):
            if css[j] == '{': depth += 1
            elif css[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        rule_block = css[i:j+1]
        # Check if any individual selector in this block references a removed element
        selectors = [s.strip() for s in selector_block.split(',')]
        keep_selectors = []
        for sel in selectors:
            if not any(rm in sel for rm in removed):
                keep_selectors.append(sel)
        if keep_selectors:
            # Reconstruct with only kept selectors
            if len(keep_selectors) == len(selectors):
                result.append(rule_block)
            else:
                body = css[brace:j+1]
                result.append(','.join(keep_selectors) + body)
        i = j + 1
    return ''.join(result)

# ── Assets ──────────────────────────────────────────────────────────────────
print("Reading assets...")

css_raw = read_text(os.path.join(BASE, 'static', 'compiler.css'))
css = strip_unused_css_rules(minify_css(css_raw))

# ── Embed JetBrains Mono fonts as base64 @font-face ─────────────────────────
print("Embedding JetBrains Mono fonts...")
_fonts_dir = os.path.join(BASE, 'compiler-assets', 'fonts')
def _read_font_b64(name):
    return read_b64(os.path.join(_fonts_dir, name))
_jb_r  = _read_font_b64('JetBrainsMono-Regular.woff2')
_jb_m  = _read_font_b64('JetBrainsMono-Medium.woff2')
_jb_sb = _read_font_b64('JetBrainsMono-SemiBold.woff2')
_jb_bd = _read_font_b64('JetBrainsMono-Bold.woff2')
FONT_FACE_CSS = (
    "@font-face{font-family:'JetBrains Mono';src:url('data:font/woff2;base64," + _jb_r  + "') format('woff2');font-weight:400;font-style:normal;font-display:block}"
    "@font-face{font-family:'JetBrains Mono';src:url('data:font/woff2;base64," + _jb_m  + "') format('woff2');font-weight:500;font-style:normal;font-display:block}"
    "@font-face{font-family:'JetBrains Mono';src:url('data:font/woff2;base64," + _jb_sb + "') format('woff2');font-weight:600;font-style:normal;font-display:block}"
    "@font-face{font-family:'JetBrains Mono';src:url('data:font/woff2;base64," + _jb_bd + "') format('woff2');font-weight:700;font-style:normal;font-display:block}"
)

ace_js         = read_text(os.path.join(BASE, 'compiler-assets', 'libs', 'ace.js'))
mode_cpp_js    = read_text(os.path.join(BASE, 'compiler-assets', 'libs', 'mode-c_cpp.js'))
theme_monokai  = read_text(os.path.join(BASE, 'compiler-assets', 'libs', 'theme-monokai.js'))
theme_textmate = read_text(os.path.join(BASE, 'compiler-assets', 'libs', 'theme-textmate.js'))

# Compress jsdos with deflate-raw — decompressed lazily via DecompressionStream on first Run
print("Compressing jsdos.js (deflate-raw)...")
jsdos_raw   = read_text(os.path.join(BASE, 'compiler-assets', 'libs', 'js-dos.js'))
jsdos_bytes = jsdos_raw.encode('utf-8')
# zlib.compress wraps raw deflate with 2-byte header + 4-byte adler32; strip them
jsdos_deflated = zlib.compress(jsdos_bytes, level=9)[2:-4]
jsdos_b64      = base64.b64encode(jsdos_deflated).decode()
print(f"  jsdos: {len(jsdos_bytes):,} → {len(jsdos_b64):,} bytes (saved {len(jsdos_bytes)-len(jsdos_b64):,} bytes)")

wdosbox_b64 = b64_of_text(read_text(os.path.join(BASE, 'compiler-assets', 'libs', 'wdosbox.js')))

print("Encoding WASM (~1.8 MB)...")
wasm_b64 = read_b64(os.path.join(BASE, 'compiler-assets', 'libs', 'wdosbox.wasm.js'))

print("Encoding TC ZIP (~3.1 MB)...")
tc_zip_b64 = read_b64(os.path.join(BASE, 'compiler-assets', 'zip-files', 'tc-v1.zip'))

demo_code = read_text(os.path.join(BASE, 'compiler-assets', 'Demo_files', 'graphics_demo.cpp'))

# ── Application JS ───────────────────────────────────────────────────────────
print("Building JS...")

JSDOS_LOADER = """
// ── Lazy jsdos loader (decompress deflate-raw on first Run) ─────────────────
let _jsdosLoading=false;
function loadJsDos(){
  if(typeof Dos!=='undefined'||_jsdosLoading)return;
  _jsdosLoading=true;
  const b64=document.getElementById('jsdos-bundle').textContent.trim();
  const raw=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const ds=new DecompressionStream('deflate-raw');
  const w=ds.writable.getWriter();w.write(raw);w.close();
  const reader=ds.readable.getReader();const chunks=[];
  function pump(){return reader.read().then(({done,value})=>{
    if(!done){chunks.push(value);return pump();}
    const tot=chunks.reduce((a,b)=>a+b.length,0);
    const out=new Uint8Array(tot);let off=0;
    chunks.forEach(c=>{out.set(c,off);off+=c.length;});
    const src=new TextDecoder().decode(out);
    const blob=new Blob([src],{type:'application/javascript'});
    const url=URL.createObjectURL(blob);
    const s=document.createElement('script');
    s.onload=()=>URL.revokeObjectURL(url);
    s.onerror=()=>console.error('[GH] jsdos load failed');
    s.src=url;document.head.appendChild(s);
  });}
  pump().catch(e=>console.error('[GH] jsdos decompress failed',e));
}
"""

APP_JS = r"""
const Logger={prefix:'[GH]',_l(t,m,a=[]){const s='color:#3b82f6;font-weight:bold;';
  if(t==='error')console.error('%c'+this.prefix+'%c '+m,s,'',...a);
  else if(t==='warn')console.warn('%c'+this.prefix+'%c '+m,s,'',...a);
  else console.log('%c'+this.prefix+'%c '+m,s,'',...a);},
  info(m){this._l('info',m)},success(m){this._l('success',m)},
  error(m,e){this._l('error',m,[e||''])},warn(m){this._l('warn',m)}};

let dosInstance=null,terminalFocused=false,editor=null,
    errorUpdateInterval=null,lastErrorContent='',
    isEditorFullscreen=false,isTerminalFullscreen=false,
    isOutputExpanded=false,keyboardEventBlocker=null;

// ── IndexedDB cache ─────────────────────────────────────────────────────────
const DB_NAME='GHCompilerStandalone',STORE='files',TTL=7*24*60*60*1000;
const TC_KEY='tc_zip_v1';
let cacheAvailable=true;

class CacheDB{
  static db=null;
  static async open(){
    if(!cacheAvailable)return null;
    if(this.db)return this.db;
    return new Promise(r=>{
      const q=indexedDB.open(DB_NAME,1);
      q.onerror=()=>{cacheAvailable=false;r(null)};
      q.onsuccess=()=>{this.db=q.result;r(this.db)};
      q.onupgradeneeded=e=>{const d=e.target.result;
        if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'key'})};
    });
  }
  static async get(key){
    const db=await this.open();if(!db)return null;
    return new Promise(r=>{
      try{const tx=db.transaction(STORE,'readonly');
        const q=tx.objectStore(STORE).get(key);
        q.onsuccess=()=>{const v=q.result;
          r(v&&(Date.now()-v.ts)<TTL?v.data:null)};
        q.onerror=()=>r(null);}catch{r(null);}
    });
  }
  static async set(key,data){
    const db=await this.open();if(!db)return;
    try{const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({key,data,ts:Date.now()});}catch{}
  }
}

// ── Binary helpers ──────────────────────────────────────────────────────────
function b64ToBytes(b64){
  const bin=atob(b64),out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}

let _wdosboxUrl=null;
function getWdosboxUrl(){
  if(_wdosboxUrl)return _wdosboxUrl;
  const text=new TextDecoder().decode(b64ToBytes(__WDOSBOX_B64__));
  _wdosboxUrl=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
  return _wdosboxUrl;
}

let _wasmBinary=null;
function getWasmBinary(){
  if(_wasmBinary)return _wasmBinary;
  _wasmBinary=b64ToBytes(__WASM_B64__);
  return _wasmBinary;
}

// ── TC ZIP ──────────────────────────────────────────────────────────────────
let tcZipPromise=null;
async function getTCZip(){
  if(tcZipPromise)return tcZipPromise;
  tcZipPromise=(async()=>{
    let blob=await CacheDB.get(TC_KEY);
    if(blob){Logger.info('TC ZIP from cache');return blob;}
    Logger.info('Decoding TC ZIP...');
    blob=new Blob([b64ToBytes(__TC_ZIP_B64__)],{type:'application/zip'});
    CacheDB.set(TC_KEY,blob);
    return blob;
  })();
  return tcZipPromise;
}

// ── Theme ────────────────────────────────────────────────────────────────────
function initTheme(){
  const t=localStorage.getItem('theme')||'dark';
  document.documentElement.setAttribute('data-theme',t);
  updateThemeIcon(t);
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
  updateThemeIcon(next);
  if(editor)editor.setTheme(next==='dark'?'ace/theme/monokai':'ace/theme/textmate');
}
function updateThemeIcon(t){
  document.getElementById('icon-dark').style.display=t==='dark'?'block':'none';
  document.getElementById('icon-light').style.display=t==='dark'?'none':'block';
}

function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)};}

// ── Editor ───────────────────────────────────────────────────────────────────
function updateEditorInfo(){
  const el=document.getElementById('editor-info');
  if(!editor||!el)return;
  const c=editor.getValue();
  el.textContent='Lines:'+c.split('\n').length+' | Chars:'+c.length;
}

async function initEditor(){
  if(typeof ace==='undefined'){setTimeout(initEditor,100);return;}
  editor=ace.edit('editor');
  const theme=document.documentElement.getAttribute('data-theme');
  editor.setTheme(theme==='dark'?'ace/theme/monokai':'ace/theme/textmate');
  editor.session.setMode('ace/mode/c_cpp');
  editor.setShowPrintMargin(false);
  editor.setOptions({
    fontSize:'16px',
    fontFamily:"'JetBrains Mono',Consolas,'Courier New',monospace",
    highlightActiveLine:true,showGutter:true,
    tabSize:4,useSoftTabs:true,wrap:true
  });
  // Load saved code or default demo
  const saved=localStorage.getItem('tc_code');
  if(saved){editor.setValue(saved,-1);}
  else{editor.setValue(__DEMO__,-1);}
  editor.clearSelection();editor.moveCursorTo(0,0);
  editor.on('change',debounce(updateEditorInfo,500));
  setTimeout(()=>{editor.focus();document.getElementById('editor-wrapper').classList.add('active');},100);
  Logger.success('Editor ready');
}

// ── Focus ────────────────────────────────────────────────────────────────────
function focusTerminal(){
  if(!dosInstance)return;
  const cv=document.getElementById('dos-canvas');
  terminalFocused=true;cv.focus();cv.tabIndex=1;
  document.getElementById('terminal-wrapper').classList.add('terminal-active');
  document.getElementById('editor-wrapper').classList.remove('active');
  document.getElementById('keyboard-blocker').classList.remove('active');
}
function focusEditor(){
  if(!editor)return;
  const cv=document.getElementById('dos-canvas');
  terminalFocused=false;cv.tabIndex=-1;cv.blur();editor.focus();
  document.getElementById('terminal-wrapper').classList.remove('terminal-active');
  document.getElementById('editor-wrapper').classList.add('active');
  document.getElementById('keyboard-blocker').classList.add('active');
}
function setupKbBlocker(){
  keyboardEventBlocker=e=>{if(!terminalFocused){e.stopPropagation();e.stopImmediatePropagation();return false;}};
  ['keydown','keyup','keypress'].forEach(ev=>window.addEventListener(ev,keyboardEventBlocker,true));
}

// ── Compilation errors ───────────────────────────────────────────────────────
async function checkErrors(){
  const op=document.getElementById('output-panel');
  const oc=document.getElementById('output-content');
  const tw=document.getElementById('terminal-wrapper');
  try{
    if(!dosInstance?.em?.FS)return;
    const FS=dosInstance.em.FS,path='/TURBOC3/BIN/ERR.TXT';
    try{FS.stat(path);}catch{return;}
    let content;
    try{content=FS.readFile(path,{encoding:'utf8'});}
    catch{content=new TextDecoder().decode(FS.readFile(path));}
    if(content&&content.trim()&&content!==lastErrorContent){
      lastErrorContent=content;
      if(content.includes('Error')||content.includes('Fatal')){
        oc.textContent=content;
        oc.classList.remove('output-success');oc.classList.add('output-error');
        if(!op.classList.contains('visible')){
          op.classList.add('visible');tw.classList.add('has-panel');
          setTimeout(()=>window.dispatchEvent(new Event('resize')),310);
        }
      }
    }
  }catch{}
}

// ── Progress ─────────────────────────────────────────────────────────────────
function setProgress(pct){
  const b=document.getElementById('loading-progress-bar');
  if(b)b.style.width=pct+'%';
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function runProgram(){
  if(!editor){alert('Editor loading, please wait...');return;}
  const code=editor.getValue();
  if(!code.trim()){alert('Please write some code first!');return;}

  const loading=document.getElementById('loading');
  const loadingText=document.getElementById('loading-text');
  const runBtn=document.getElementById('run-btn');
  const op=document.getElementById('output-panel');
  const oc=document.getElementById('output-content');
  const tw=document.getElementById('terminal-wrapper');

  loadJsDos();
  loading.classList.add('active');
  loadingText.textContent='Initializing...';
  setProgress(0);runBtn.disabled=true;runBtn.classList.add('loading');

  if(dosInstance){try{dosInstance.exit();}catch{}dosInstance=null;}
  if(errorUpdateInterval){clearInterval(errorUpdateInterval);errorUpdateInterval=null;}
  op.classList.remove('visible');tw.classList.remove('has-panel');
  lastErrorContent='';oc.textContent='';

  try{
    if(typeof Dos==='undefined'){
      loadingText.textContent='Loading JS-DOS...';setProgress(10);
      await new Promise(r=>{const id=setInterval(()=>{if(typeof Dos!=='undefined'){clearInterval(id);r();}},100);});
    }
    setProgress(20);

    const canvas=document.getElementById('dos-canvas');
    try{canvas.getContext('2d',{willReadFrequently:true});}catch{}

    loadingText.textContent='Preparing emulator...';
    const wdosboxUrl=getWdosboxUrl();
    setProgress(35);

    loadingText.textContent='Loading WASM...';
    const wasmBinary=getWasmBinary();
    setProgress(50);

    Dos(canvas,{wdosboxUrl,cycles:'max',autolock:false,wasmBinary})
      .ready(async(fs,main)=>{
        loadingText.textContent='Loading Turbo C++...';setProgress(60);
        try{
          const tcBlob=await getTCZip();
          const blobUrl=URL.createObjectURL(tcBlob);
          loadingText.textContent='Extracting compiler...';
          await fs.extract(blobUrl);
          URL.revokeObjectURL(blobUrl);
        }catch(e){throw new Error('Failed to load compiler: '+e.message);}

        setProgress(80);
        fs.createFile('TURBOC3/BIN/USER.CPP',code);
        fs.createFile('AUTOEXEC.BAT',
`@ECHO OFF\r\nCD TURBOC3\\BIN\r\nIF EXIST USER.EXE DEL USER.EXE\r\nIF EXIST ERR.TXT DEL ERR.TXT\r\nTCC -I..\\INCLUDE -L..\\LIB -n. USER.CPP ..\\LIB\\GRAPHICS.LIB > ERR.TXT\r\nIF EXIST USER.EXE GOTO SUCCESS\r\nCLS\r\nECHO ========================================\r\nECHO COMPILATION ERRORS:\r\nECHO ========================================\r\nTYPE ERR.TXT\r\nECHO.\r\nPAUSE\r\nEXIT\r\n:SUCCESS\r\nCLS\r\nUSER.EXE\r\nPAUSE\r\n`);

        setProgress(90);loadingText.textContent='Starting...';
        dosInstance=await main(['-conf','dosbox.conf','AUTOEXEC.BAT']);
        setupKbBlocker();
        setProgress(100);
        loading.classList.remove('active');runBtn.disabled=false;runBtn.classList.remove('loading');
        Logger.success('Running');
        setTimeout(focusTerminal,500);
        errorUpdateInterval=setInterval(checkErrors,1000);
      });
  }catch(err){
    Logger.error('DOS failed',err);
    alert('Failed: '+err.message);
    loading.classList.remove('active');runBtn.disabled=false;runBtn.classList.remove('loading');
    setProgress(0);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  initTheme();
  document.getElementById('theme-toggle').addEventListener('click',toggleTheme);
  document.getElementById('run-btn').addEventListener('click',runProgram);

  document.getElementById('fullscreen-editor-btn').addEventListener('click',()=>{
    isEditorFullscreen=!isEditorFullscreen;
    document.getElementById('editor-wrapper').classList.toggle('fullscreen',isEditorFullscreen);
    document.getElementById('terminal-wrapper').classList.toggle('hidden',isEditorFullscreen);
    setTimeout(()=>editor?.resize(),100);
  });
  document.getElementById('fullscreen-terminal-btn').addEventListener('click',()=>{
    isTerminalFullscreen=!isTerminalFullscreen;
    document.getElementById('terminal-wrapper').classList.toggle('fullscreen',isTerminalFullscreen);
    document.getElementById('editor-wrapper').classList.toggle('hidden',isTerminalFullscreen);
    setTimeout(()=>dosInstance&&window.dispatchEvent(new Event('resize')),100);
  });
  document.getElementById('close-output-btn').addEventListener('click',()=>{
    document.getElementById('output-panel').classList.remove('visible');
    document.getElementById('terminal-wrapper').classList.remove('has-panel');
    window.dispatchEvent(new Event('resize'));
  });
  document.getElementById('copy-error-btn').addEventListener('click',async()=>{
    const text=document.getElementById('output-content').textContent;
    if(!text?.trim())return;
    const btn=document.getElementById('copy-error-btn');
    const btnT=document.getElementById('copy-btn-text');
    try{await navigator.clipboard.writeText(text);}
    catch{const ta=document.createElement('textarea');
      ta.value=text;ta.style.cssText='position:fixed;left:-9999px';
      document.body.appendChild(ta);ta.select();document.execCommand('copy');
      document.body.removeChild(ta);}
    btn.classList.add('copied');btnT.textContent='Copied!';
    setTimeout(()=>{btn.classList.remove('copied');btnT.textContent='Copy Errors';},2000);
  });
  document.getElementById('expand-output-btn').addEventListener('click',()=>{
    isOutputExpanded=!isOutputExpanded;
    document.getElementById('output-panel').classList.toggle('expanded',isOutputExpanded);
    document.getElementById('expand-output-btn').classList.toggle('expanded',isOutputExpanded);
    setTimeout(()=>window.dispatchEvent(new Event('resize')),310);
  });
  document.getElementById('keyboard-blocker').addEventListener('click',focusTerminal);
  document.getElementById('terminal-wrapper').addEventListener('click',e=>{
    const tw=document.getElementById('terminal-wrapper');
    const cv=document.getElementById('dos-canvas');
    if((e.target===tw||e.target===cv)&&dosInstance&&!terminalFocused)focusTerminal();
  });
  document.getElementById('editor-wrapper').addEventListener('click',focusEditor);

  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();focusEditor();return false;}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!terminalFocused){e.preventDefault();runProgram();}
    if((e.ctrlKey||e.metaKey)&&e.key==='s'&&!terminalFocused){
      e.preventDefault();
      if(editor){localStorage.setItem('tc_code',editor.getValue());Logger.info('Code saved to localStorage');}
    }
  },true);
  window.addEventListener('resize',()=>{editor?.resize();editor?.renderer?.updateFull();});
  window.addEventListener('orientationchange',()=>setTimeout(()=>editor?.resize(),300));

  initEditor().then(()=>Logger.success('Ready'));
});
"""

# ── Assemble ─────────────────────────────────────────────────────────────────
print("Assembling HTML...")

# Heavy base64 data — placed at end of body so APP_JS initialises the editor first.
# These are declared as `var` in the APP_JS block (hoisted), assigned here at the end.
heavy_js = (
    f'__WDOSBOX_B64__="{wdosbox_b64}";\n'
    f'__WASM_B64__="{wasm_b64}";\n'
    f'__TC_ZIP_B64__="{tc_zip_b64}";\n'
)

# Minify APP_JS and prepend loader + demo + var declarations
full_app_js = (
    f'var __WDOSBOX_B64__,__WASM_B64__,__TC_ZIP_B64__;\n'
    f'const __DEMO__=`{bt_escape(demo_code)}`;\n'
    + minify_js(JSDOS_LOADER + APP_JS)
)

GITHUB_BTN_CSS = (
    ".github-btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;"
    "border-radius:8px;font-size:0.8125rem;font-weight:600;"
    "border:1px solid var(--border-color);"
    "background:var(--vscode-line-bg);color:var(--text-primary);text-decoration:none;"
    "transition:background 0.2s ease,border-color 0.2s ease,color 0.2s ease,transform 0.15s ease;"
    "white-space:nowrap;letter-spacing:0.01em}"
    ".github-btn:hover{background:#24292e;border-color:#555;color:#fff;transform:translateY(-1px)}"
    "[data-theme='light'] .github-btn:hover{background:#24292e;border-color:#24292e;color:#fff}"
    ".github-btn svg{width:16px;height:16px;flex-shrink:0;opacity:0.9}"
    "[data-theme='light'] .github-btn{border:2px solid var(--border-color);background:var(--vscode-line-bg)}"
)

HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Graphics.h Compiler</title>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>{FONT_FACE_CSS}{css}{GITHUB_BTN_CSS}</style>
</head>
<body>
<header>
 <div class="header-content">
  <div class="header-left">
   <a href="https://github.com/AlbatrossC/graphics-h-compiler" target="_blank" rel="noopener" class="github-btn" title="View Source on GitHub">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
    GitHub
   </a>
  </div>
  <div class="header-center">
   <div class="logo">
    <span class="logo-full">Online <span class="logo-highlight">graphics.h</span> Compiler</span>
    <span class="logo-mobile"><span class="logo-highlight">graphics.h</span> Compiler</span>
   </div>
  </div>
  <div class="header-right">
   <button id="theme-toggle" class="theme-toggle" title="Toggle Theme">
    <svg id="icon-dark" viewBox="0 0 24 24" fill="currentColor" style="display:block"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <svg id="icon-light" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
   </button>
  </div>
  <button id="run-btn" class="btn btn-primary">
   <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
   <span class="btn-text">Compile &amp; Run</span>
  </button>
 </div>
</header>

<div id="workspace">
 <div id="editor-wrapper">
  <div class="panel-header">
   <div class="panel-title">
    <svg viewBox="0 0 24 24" fill="currentColor" class="panel-icon"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
    Source Code Editor
   </div>
   <div class="panel-actions">
    <button id="fullscreen-editor-btn" class="icon-btn" title="Toggle Fullscreen">
     <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
    </button>
   </div>
  </div>
  <div id="editor"></div>
  <div class="editor-footer"><span class="editor-info" id="editor-info">Lines:0 | Chars:0</span></div>
 </div>

 <div id="terminal-wrapper">
  <div class="panel-header">
   <div class="panel-title">
    <svg viewBox="0 0 24 24" fill="currentColor" class="panel-icon"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4V8h16v10z"/></svg>
    DOS Output
   </div>
   <div class="panel-actions">
    <button id="fullscreen-terminal-btn" class="icon-btn" title="Toggle Fullscreen">
     <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
    </button>
   </div>
  </div>

  <div class="keyboard-blocker" id="keyboard-blocker">
   <div class="blocker-message">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
    Click to interact with terminal
   </div>
  </div>

  <div class="loading-overlay" id="loading">
   <div class="spinner"></div>
   <div class="loading-text" id="loading-text">Initializing...</div>
   <div class="loading-progress"><div class="loading-progress-bar" id="loading-progress-bar"></div></div>
  </div>

  <canvas id="dos-canvas" tabindex="-1"></canvas>

  <div id="output-panel">
   <div class="output-header">
    <div class="output-title">
     <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;color:var(--danger)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
     Compilation Errors
    </div>
    <div class="output-actions">
     <button id="copy-error-btn" class="copy-error-btn" title="Copy errors">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
      <span id="copy-btn-text">Copy Errors</span>
     </button>
     <button id="expand-output-btn" class="expand-btn" title="Expand/Collapse">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
     </button>
     <button id="close-output-btn" class="icon-btn" style="height:28px;width:28px;min-height:unset;border:1px solid var(--border-color);background:transparent;border-radius:6px;">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
     </button>
    </div>
   </div>
   <div id="output-content" class="output-content"></div>
  </div>
 </div>
</div>

<script>{safe_js(ace_js)}</script>
<script>{safe_js(mode_cpp_js)}</script>
<script>{safe_js(theme_monokai)}</script>
<script>{safe_js(theme_textmate)}</script>
<script type="text/plain" id="jsdos-bundle">{jsdos_b64}</script>
<script>
{full_app_js}
</script>
<script>
{heavy_js}
</script>
</body>
</html>"""

out = os.path.join(BASE, 'standalone_compiler.html')
print(f"Writing {out}...")
with open(out, 'w', encoding='utf-8') as f:
    f.write(HTML)

mb = os.path.getsize(out)/1_048_576
print(f"\nDone! {mb:.2f} MB ({os.path.getsize(out):,} bytes)")
print("\nRemoved: save/unsave, demo selector, home button, autocomplete")
print("Added:   JetBrains Mono (embedded), GitHub btn, compressed+lazy jsdos, heavy data at end")
