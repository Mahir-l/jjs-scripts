/*
DeltaExecutor.js — Auto.js (jjs) Delta Executor
Author: generated for Mahir-l/jjs-scripts

Description:
- Runs a sequence of black "flashes" on-screen according to a delta list.
- Designed for Auto.js / Android jjs environments that provide `floaty`, `threads`, `clipboard`, and standard JS timers.

Delta format (comma-separated list):
  offset_ms:duration_ms:fade_ms
Example:
  0:120:80,400:120:80,900:200:0
Meaning:
  - Flash at 0 ms for 120 ms with an 80 ms fade-out
  - Flash at 400 ms ...

Usage:
1. Grant Auto.js the permission to draw overlays if prompted.
2. Put a delta string on clipboard (or edit DEFAULT_DELTA below).
3. Run the script. Use the small control window to Load (from clipboard), Start, Stop, Toggle Immersive UI, or Exit.

Notes & limitations:
- Uses floaty windows. If permission is not granted the script will show a toast and exit.
- Timing is done with setTimeout; on older devices timing jitter may occur.
- Alpha/fade step is 16ms per step (approx one frame). You can tweak STEP_MS.
*/

// --- Configuration ---
var DEFAULT_DELTA = "0:120:80,400:120:80,900:200:0"; // used if clipboard empty
var STEP_MS = 16; // fade step resolution (ms)

// --- Helper: parse delta list ---
function parseDeltaString(str) {
    if (!str) return [];
    var parts = str.split(/[,\n]+/).map(function(s){ return s.trim(); }).filter(Boolean);
    var out = [];
    for (var i=0;i<parts.length;i++){
        var p = parts[i];
        // allow either offset:duration:fade or duration:fade (implicit offset is cumulative)
        var seg = p.split(':').map(function(x){ return Number(x.trim()) || 0; });
        if (seg.length === 1) {
            // just duration -> schedule immediately after previous
            var offset = (out.length? out[out.length-1].offset + out[out.length-1].duration : 0);
            out.push({offset: offset, duration: seg[0], fade: 0});
        } else if (seg.length === 2) {
            // duration:fade -> offset is cumulative
            var offset = (out.length? out[out.length-1].offset + out[out.length-1].duration : 0);
            out.push({offset: offset, duration: seg[0], fade: seg[1]});
        } else {
            // offset:duration:fade
            out.push({offset: seg[0], duration: seg[1], fade: seg[2]});
        }
    }
    // normalize numeric values and clamp
    out.forEach(function(d){
        d.offset = Math.max(0, Math.floor(Number(d.offset)||0));
        d.duration = Math.max(1, Math.floor(Number(d.duration)||1));
        d.fade = Math.max(0, Math.floor(Number(d.fade)||0));
    });
    return out;
}

// --- Try to create overlay windows ---
var overlayWin, ctrlWin;
try {
    overlayWin = floaty.rawWindow(
        <frame id="root">
            <frame id="overlay" bg="#000" w="*" h="*" />
        </frame>
    );
    // Make overlay full screen
    overlayWin.setSize(device.width, device.height);
    // Start invisible
    try { overlayWin.overlay.setAlpha(0); } catch(e){ /* ignore */ }
} catch (e) {
    toast("Failed to create overlay. Grant floaty/overlay permission and re-run.");
    exit();
}

// control window (small) to start/stop
ctrlWin = floaty.window(
    <vertical padding="6" bg="#40000000" gravity="top">
        <horizontal>
            <button id="load" text="Load" w="70" h="48" />
            <button id="start" text="Start" w="70" h="48" />
            <button id="stop" text="Stop" w="70" h="48" />
        </horizontal>
        <horizontal>
            <button id="imm" text="Immersive" w="110" h="48" />
            <button id="exit" text="Exit" w="70" h="48" />
        </horizontal>
        <text id="status" text="delta: not loaded" textSize="12" color="#fff" />
    </vertical>
);

ctrlWin.setPosition(10, 50);

// drag to move control window
ctrlWin.root.setOnTouchListener(new android.view.View.OnTouchListener({
    downX:0, downY:0, moved:false,
    onTouch: function(view, event){
        try{
            if (event.getAction() == event.ACTION_DOWN) {
                this.downX = event.getRawX();
                this.downY = event.getRawY();
                this.moved = false;
                return true;
            } else if (event.getAction() == event.ACTION_MOVE) {
                var dx = event.getRawX() - this.downX;
                var dy = event.getRawY() - this.downY;
                var p = ctrlWin.getX() + dx;
                var q = ctrlWin.getY() + dy;
                ctrlWin.setPosition(Math.floor(p), Math.floor(q));
                this.downX = event.getRawX();
                this.downY = event.getRawY();
                this.moved = true;
                return true;
            } else if (event.getAction() == event.ACTION_UP) {
                return this.moved;
            }
        } catch (e){}
        return true;
    }
}));

var timers = []; // store timeout ids for cancellation
var deltas = parseDeltaString(DEFAULT_DELTA);
var seqStartTime = null;
var running = false;
var immersive = false;

function setStatus(s){
    try { ctrlWin.status.setText(s); } catch(e){}
}

function loadFromClipboardOrDefault(){
    var clip = clipboard.get();
    if (clip && String(clip).trim()){
        deltas = parseDeltaString(String(clip).trim());
        setStatus("loaded from clipboard: " + deltas.length + " items");
    } else {
        deltas = parseDeltaString(DEFAULT_DELTA);
        setStatus("loaded default: " + deltas.length + " items");
    }
}

function clearTimers(){
    for (var i=0;i<timers.length;i++){
        try { clearTimeout(timers[i]); } catch(e){}
    }
    timers = [];
}

function stopAll(){
    running = false;
    clearTimers();
    // ensure overlay hidden
    try { overlayWin.overlay.setAlpha(0); } catch(e){}
    setStatus("stopped");
}

function startSequence(opt){
    opt = opt || {};
    if (!deltas || deltas.length===0){
        setStatus("no deltas loaded");
        return;
    }
    stopAll();
    running = true;
    seqStartTime = Date.now() + (opt.startDelay||50);
    // schedule each flash
    for (var i=0;i<deltas.length;i++){
        (function(d){
            var tStart = seqStartTime + d.offset;
            var delay = Math.max(0, tStart - Date.now());
            var id = setTimeout(function(){
                if (!running) return;
                doFlash(d.duration, d.fade);
            }, delay);
            timers.push(id);
        })(deltas[i]);
    }
    setStatus("running: " + deltas.length + " items");
}

function doFlash(durationMs, fadeMs){
    // show immediately
    try { overlayWin.overlay.setAlpha(1); } catch(e){}
    if (fadeMs <= 0) {
        // hard cut: hide after duration
        var hideId = setTimeout(function(){ try{ overlayWin.overlay.setAlpha(0);}catch(e){} }, durationMs);
        timers.push(hideId);
        return;
    }
    var visibleTime = Math.max(1, durationMs - fadeMs);
    // after visibleTime, start fade out over fadeMs
    var t1 = setTimeout(function(){
        var steps = Math.max(1, Math.ceil(fadeMs / STEP_MS));
        var stepMs = fadeMs / steps;
        var step = 0;
        var fadeId = setInterval(function(){
            step++;
            var a = Math.max(0, 1 - (step / steps));
            try { overlayWin.overlay.setAlpha(a); } catch(e){}
            if (step >= steps){
                try { clearInterval(fadeId); overlayWin.overlay.setAlpha(0); } catch(e){}
            }
        }, Math.round(stepMs));
        timers.push(fadeId);
    }, visibleTime);
    timers.push(t1);
}

// Control button handlers
ctrlWin.load.on("click", function(){
    loadFromClipboardOrDefault();
});
ctrlWin.start.on("click", function(){
    // reload before start
    loadFromClipboardOrDefault();
    startSequence({startDelay:80});
});
ctrlWin.stop.on("click", function(){
    stopAll();
});
ctrlWin.imm.on("click", function(){
    toggleImmersive();
});
ctrlWin.exit.on("click", function(){
    stopAll();
    try{ overlayWin.close(); }catch(e){}
    try{ ctrlWin.close(); }catch(e){}
    exit();
});

function toggleImmersive(){
    // Try to hide system UI via Android calls. This may not work on all devices.
    try{
        var activity = context.getClass().getMethod('getSystemService', java.lang.String.class).invoke(context, android.content.Context.WINDOW_SERVICE);
    }catch(e){}
    immersive = !immersive;
    try{
        var window = floaty.getWindow(); // may not exist
        // Best-effort: use UiMode via device.
        var decorView = activity && activity.getDecorView && activity.getDecorView();
        if (decorView){
            var flags = android.view.View.SYSTEM_UI_FLAG_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            if (immersive) decorView.setSystemUiVisibility(flags);
            else decorView.setSystemUiVisibility(0);
        }
    }catch(e){
        // ignore — not essential
    }
    setStatus(immersive? "immersive: ON" : "immersive: OFF");
}

// Auto-load from clipboard on launch
loadFromClipboardOrDefault();
setStatus("ready — " + deltas.length + " items. Use Load/Start.");

// Keep script alive
events.on("exit", function(){
    try{ overlayWin.close(); }catch(e){}
    try{ ctrlWin.close(); }catch(e){}
});

// end of file
