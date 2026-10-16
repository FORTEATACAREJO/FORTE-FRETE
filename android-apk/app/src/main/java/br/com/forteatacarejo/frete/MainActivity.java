package br.com.forteatacarejo.frete;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import java.util.ArrayList;

public class MainActivity extends Activity {
 private static final String HOME = "https://forte-frete.onrender.com/";
 private static final int PICK_DOCUMENT = 405;
 private WebView web;
 private LinearLayout errorPanel;
 private ValueCallback<Uri[]> fileCallback;

 static boolean isAppUrl(Uri uri) {
  return "https".equals(uri.getScheme()) && "forte-frete.onrender.com".equals(uri.getHost())
   && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
 }
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  FrameLayout root = new FrameLayout(this);
  root.setOnApplyWindowInsetsListener((v, insets) -> {
   v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
   return insets;
  });
  setContentView(root);
  web = new WebView(this);
  root.addView(web, new FrameLayout.LayoutParams(-1, -1));
  errorPanel = new LinearLayout(this);
  errorPanel.setOrientation(LinearLayout.VERTICAL);
  errorPanel.setGravity(android.view.Gravity.CENTER);
  errorPanel.setPadding(40, 40, 40, 40);
  errorPanel.setBackgroundColor(0xfff4f7fb);
  TextView message = new TextView(this);
  message.setText("Não foi possível abrir o Forte Frete.\nConfira sua conexão e tente novamente.");
  message.setGravity(android.view.Gravity.CENTER);
  message.setTextSize(18);
  Button retry = new Button(this);
  retry.setText("TENTAR NOVAMENTE");
  retry.setOnClickListener(v -> { errorPanel.setVisibility(View.GONE); web.loadUrl(HOME); });
  errorPanel.addView(message); errorPanel.addView(retry);
  root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
  errorPanel.setVisibility(View.GONE);
  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(true);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setSupportMultipleWindows(true);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
  web.addJavascriptInterface(new NotificationBridge(this), "ForteNotifications");
  web.setWebViewClient(new WebViewClient() {
   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    Uri uri = request.getUrl();
    if (isAppUrl(uri)) return false;
    if (request.isForMainFrame()) openExternal(uri);
    return true;
   }
   @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
    if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
   }
   @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
    if (request.isForMainFrame() && response.getStatusCode() >= 400) errorPanel.setVisibility(View.VISIBLE);
   }
  });
  web.setWebChromeClient(new WebChromeClient() {
   @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
    if (fileCallback != null) fileCallback.onReceiveValue(null);
    fileCallback = callback;
    Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    picker.addCategory(Intent.CATEGORY_OPENABLE);
    picker.setType("*/*");
    picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/jpeg", "image/png", "image/webp"});
    picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
    try { startActivityForResult(picker, PICK_DOCUMENT); }
    catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; toast("Nenhum seletor de documentos disponível."); }
    return true;
   }
   @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message result) {
    if (!gesture) return false;
    WebView popup = new WebView(MainActivity.this);
    popup.setWebViewClient(new WebViewClient() {
     @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
      openExternal(request.getUrl()); child.destroy(); return true;
     }
    });
    ((WebView.WebViewTransport) result.obj).setWebView(popup); result.sendToTarget(); return true;
   }
   @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
    new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK", (d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show(); return true;
   }
   @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
    new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("CONFIRMAR", (d,w)->result.confirm()).setNegativeButton("CANCELAR", (d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show(); return true;
   }
  });
  web.setDownloadListener((url, agent, disposition, mime, size) -> openExternal(Uri.parse(url)));
  if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);
 }
 private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
 private void openExternal(Uri uri) {
  String scheme = uri.getScheme();
  if (!"https".equals(scheme) && !"tel".equals(scheme) && !"mailto".equals(scheme) && !"whatsapp".equals(scheme)) {
   toast("Este formato de link não pode ser aberto no aplicativo."); return;
  }
  try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
  catch (ActivityNotFoundException e) { toast("Não há aplicativo disponível para abrir este link."); }
 }
 @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
  super.onActivityResult(requestCode, resultCode, data);
  if (requestCode != PICK_DOCUMENT || fileCallback == null) return;
  ArrayList<Uri> valid = new ArrayList<>();
  Uri[] selected = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
  if (selected != null) for (Uri uri : selected) {
   if (uri == null || !"content".equals(uri.getScheme()) || getPackageName().equals(uri.getAuthority()) || (uri.getAuthority()!=null && uri.getAuthority().startsWith(getPackageName()+"."))) continue;
   try {
    String type = getContentResolver().getType(uri);
    if (!"application/pdf".equals(type) && !"image/jpeg".equals(type) && !"image/png".equals(type) && !"image/webp".equals(type)) continue;
    valid.add(uri);
   } catch (SecurityException ignored) { }
  }
  fileCallback.onReceiveValue(valid.isEmpty() ? null : valid.toArray(new Uri[0])); fileCallback = null;
 }
 @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
 @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
 @Override protected void onDestroy() {
  if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
  web.removeJavascriptInterface("ForteNotifications"); web.destroy(); super.onDestroy();
 }
}
