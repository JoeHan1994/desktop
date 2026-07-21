import type { Metadata } from 'next';

export const metadata: Metadata = {
	title: 'MyToolBox',
	description: 'MyToolBox desktop workspace',
};

const criticalFallbackCss = String.raw`
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#04060c;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}button,input,textarea{font:inherit}svg{display:block;flex-shrink:0}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.inset-x-0{left:0;right:0}.z-10{z-index:10}.z-20{z-index:20}.z-\[999\]{z-index:999}.flex{display:flex}.grid{display:grid}.hidden{display:none}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}.min-h-0{min-height:0}.min-w-0{min-width:0}.h-screen{height:100vh}.w-screen{width:100vw}.h-full{height:100%}.w-full{width:100%}.h-3{height:.75rem}.w-3{width:.75rem}.h-3\.5{height:.875rem}.w-3\.5{width:.875rem}.h-4{height:1rem}.w-4{width:1rem}.h-6{height:1.5rem}.w-6{width:1.5rem}.h-7{height:1.75rem}.w-7{width:1.75rem}.h-9{height:2.25rem}.w-9{width:2.25rem}.h-12{height:3rem}.w-12{width:3rem}.max-w-\[420px\]{max-width:420px}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.items-center{align-items:center}.items-end{align-items:flex-end}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.flex-col{flex-direction:column}.gap-1{gap:.25rem}.gap-1\.5{gap:.375rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.bg-\[\#04060c\]{background:#04060c}.bg-black{background:#000}.text-white{color:#fff}.text-center{text-align:center}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.select-none{user-select:none}.rounded-lg{border-radius:.5rem}.rounded-xl{border-radius:.75rem}.rounded-2xl{border-radius:1rem}.rounded-full{border-radius:9999px}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-1\.5{padding-top:.375rem;padding-bottom:.375rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-xl{font-size:1.25rem;line-height:1.75rem}.font-semibold{font-weight:600}.font-bold{font-weight:700}.antialiased{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.glass{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(18px)}.app-card{border-radius:16px}.glass-input{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
body[data-vv-asset-failed="true"]:before{content:"资源加载异常，正在等待刷新恢复";position:fixed;left:50%;top:16px;z-index:2147483647;transform:translateX(-50%);border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(4,6,12,.92);padding:8px 12px;color:rgba(255,255,255,.8);font-size:12px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
`;

const assetRecoveryScript = `
(function(){
  var KEY='mytoolbox.asset-recover-at';
  var FAIL='mytoolbox.asset-recover-failed';
  var RECOVER_PARAM='__vv_recover';
  function isAssetUrl(value){return typeof value==='string'&&value.indexOf('/_next/static/')!==-1;}
  function isRecoverableMessage(value){return /ChunkLoadError|Loading chunk|Cannot find module|MODULE_NOT_FOUND|webpack-runtime|_next\\/static/i.test(String(value||''));}
  function showFallback(reason){
    try{document.body&&document.body.setAttribute('data-vv-asset-failed','true');}catch(_e){}
    try{console.warn('[asset-recovery]',reason);}catch(_e){}
  }
  function hardReload(reason){
    var now=Date.now();
    var last=Number(sessionStorage.getItem(KEY)||0);
    if(now-last<15000){sessionStorage.setItem(FAIL,'1');showFallback(reason);return;}
    sessionStorage.setItem(KEY,String(now));
    var url=new URL(location.href);
    url.searchParams.set(RECOVER_PARAM,String(now));
    location.replace(url.toString());
  }
  window.addEventListener('error',function(event){
    var target=event.target;
    var tag=target&&target.tagName;
    var url=target&&(target.src||target.href);
    if((tag==='SCRIPT'||tag==='LINK')&&isAssetUrl(url)){hardReload('asset-load:'+url);return;}
    if(isRecoverableMessage(event.message)||isRecoverableMessage(event.error&&event.error.stack)){hardReload(event.message||'runtime');}
  },true);
  window.addEventListener('unhandledrejection',function(event){
    var reason=event.reason;
    if(isRecoverableMessage(reason&&reason.message)||isRecoverableMessage(reason&&reason.stack)||isRecoverableMessage(reason)){hardReload('promise:'+String(reason&&reason.message||reason));}
  });
  window.addEventListener('load',function(){
    if(sessionStorage.getItem(FAIL)==='1')showFallback('recovery-failed');
  });
})();
`;

/**
 * 全局布局。
 *
 * V2 应用 (V2App) 自带主题上下文、样式框架与全局 Provider，
 * 此处仅提供最小化的 html/body 外壳以及资源加载的兜底与自恢复脚本。
 */
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="zh-CN">
			<head>
				<style dangerouslySetInnerHTML={{ __html: criticalFallbackCss }} />
				<script dangerouslySetInnerHTML={{ __html: assetRecoveryScript }} />
			</head>
			<body>{children}</body>
		</html>
	);
}
