(function () {
  // SPA 404 fix: Vercel redireciona 404s via sessionStorage
  try {
    var redirect = window.sessionStorage && window.sessionStorage.redirect;
    if (window.sessionStorage) delete window.sessionStorage.redirect;
    if (redirect && redirect !== location.href) history.replaceState(null, null, redirect);
  } catch (e) {}

  // Fatal error overlay (dev/debug utility)
  function showFatalError(message, stack) {
    function insert() {
      var d = document.getElementById('fatal-error-overlay');
      if (!d) {
        d = document.createElement('div');
        d.id = 'fatal-error-overlay';
        d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fee2e2;border-bottom:2px solid #ef4444;color:#991b1b;font-family:monospace;padding:15px;z-index:9999999;font-size:13px;white-space:pre-wrap;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-height:50vh;overflow-y:auto;';
        document.body.insertBefore(d, document.body.firstChild);
      }
      d.innerHTML = '<h3 style="margin:0 0 5px 0;font-size:14px;color:#dc2626;">&#x1F6A8; Erro de Execução Detectado:</h3>' +
        '<p style="font-weight:bold;margin:5px 0;font-size:12px;">' + message + '</p>' +
        '<pre style="font-size:10px;background:#fff;padding:8px;border:1px solid #fee2e2;overflow:auto;margin:5px 0 0 0;">' + (stack || 'Sem rastreamento de pilha') + '</pre>';
    }
    if (document.body) insert(); else document.addEventListener('DOMContentLoaded', insert);
  }

  // Banner de erro vermelho: SÓ em desenvolvimento (localhost).
  // Em produção, um erro pontual qualquer apareceria para clientes reais — péssimo.
  var isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isDev) {
    window.onerror = function (message, source, lineno, colno, error) {
      showFatalError(message + '\nFonte: ' + source + ' (Linha ' + lineno + ', Col ' + colno + ')', error && error.stack);
      return false;
    };
    window.onunhandledrejection = function (event) {
      var r = event.reason;
      showFatalError('Promessa rejeitada não tratada: ' + (r && r.message || String(r)), r && r.stack);
    };
  }
})();
