// SevenThirty: apply the saved light/dark choice before the page paints. Loaded as a plain script in <head>.
try{var t=localStorage.getItem("st-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}
