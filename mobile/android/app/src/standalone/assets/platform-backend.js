(function(){
  var pending=new Map(),sequence=0;

  function call(method,args){
    return new Promise(function(resolve,reject){
      if(!window.VitrNative||typeof window.VitrNative[method]!=="function"){
        reject(new Error("Vitr Android backend is unavailable."));
        return;
      }
      var id="vitr-"+Date.now()+"-"+(++sequence);
      pending.set(id,{resolve:resolve,reject:reject});
      try{
        window.VitrNative[method].apply(window.VitrNative,(args||[]).concat(id));
      }catch(error){
        pending.delete(id);
        reject(error);
      }
    });
  }

  window.__vitrNativeResult=function(id,ok,data){
    var entry=pending.get(id);
    if(!entry)return;
    pending.delete(id);
    if(ok)entry.resolve(data);
    else entry.reject(new Error(data&&data.message||"Vitr Android backend error"));
  };

  window.__vitrNativePlayerState=function(state){
    window.dispatchEvent(new CustomEvent("vitr-player-state",{detail:state||{}}));
  };

  window.vitrPlatformBackend={
    search:function(query){return call("search",[String(query||"")])},
    discover:function(query,entityType){return call("discover",[String(query||""),String(entityType||"all")])},
    play:function(track,queue){
      return call("play",[
        JSON.stringify(track||{}),
        JSON.stringify(Array.isArray(queue)&&queue.length?queue:[track].filter(Boolean))
      ]);
    },
    state:function(){return call("state",[])},
    library:function(){return call("library",[])},
    history:function(){return call("history",[])},
    toggleFavorite:function(track){return call("toggleFavorite",[JSON.stringify(track||{})])},
    lyrics:function(track){return call("lyrics",[JSON.stringify(track||{})])},
    download:function(track,format){return call("download",[JSON.stringify(track||{}),String(format||"m4a")])},
    runtimeStatus:function(){return call("runtimeStatus",[])},
    updateRuntime:function(){return call("updateRuntime",[])},
    checkClientUpdate:function(){return call("checkClientUpdate",[])},
    openReleasePage:function(url){if(window.VitrNative)window.VitrNative.openReleasePage(String(url||"https://github.com/bloodvitr/vitr/releases"))},
    togglePlay:function(){if(window.VitrNative)window.VitrNative.togglePlay()},
    pause:function(){if(window.VitrNative)window.VitrNative.pause()},
    next:function(){if(window.VitrNative)window.VitrNative.next()},
    previous:function(){if(window.VitrNative)window.VitrNative.previous()},
    seek:function(positionMs){if(window.VitrNative)window.VitrNative.seek(Number(positionMs)||0)},
    setVolume:function(volume){if(window.VitrNative)window.VitrNative.setVolume(Math.max(0,Math.min(1,Number(volume)||0)))},
    setShuffle:function(enabled){if(window.VitrNative)window.VitrNative.setShuffle(!!enabled)},
    setRepeat:function(mode){if(window.VitrNative)window.VitrNative.setRepeat(String(mode||"off"))}
  };

  window.dispatchEvent(new CustomEvent("vitr-backend-ready"));
})();