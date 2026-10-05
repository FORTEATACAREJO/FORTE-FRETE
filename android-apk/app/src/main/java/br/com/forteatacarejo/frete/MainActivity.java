package br.com.forteatacarejo.frete;
import android.app.Activity;import android.os.Bundle;import android.webkit.*;import android.content.Intent;import android.net.Uri;
public class MainActivity extends Activity {
 private WebView web;
 @Override public void onCreate(Bundle state){super.onCreate(state);web=new WebView(this);setContentView(web);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setDatabaseEnabled(true);web.addJavascriptInterface(new NotificationBridge(this),"ForteNotifications");
 web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if(uri.toString().startsWith("https://forte-frete.onrender.com/"))return false;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}return true;}});
 web.setWebChromeClient(new WebChromeClient());web.loadUrl("https://forte-frete.onrender.com/");}
 @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
}