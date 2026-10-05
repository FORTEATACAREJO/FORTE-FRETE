package br.com.forteatacarejo.frete;
import android.app.job.*;
import android.app.NotificationManager;
import android.content.*;
import android.security.keystore.*;
import android.util.Base64;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class NotificationJob extends JobService {
 private volatile Thread task;
 private static SecretKey key() throws Exception {
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias("forte-notification-session")){
   KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   generator.init(new KeyGenParameterSpec.Builder("forte-notification-session",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();
  }
  return (SecretKey)store.getKey("forte-notification-session",null);
 }
 static void store(Context context,String json) throws Exception {
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
  context.getSharedPreferences("forte-notifications",0).edit().putString("session",Base64.encodeToString(cipher.doFinal(json.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP)).putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).apply();
 }
 static JSONObject read(Context context) throws Exception {
  SharedPreferences prefs=context.getSharedPreferences("forte-notifications",0);String value=prefs.getString("session",null);if(value==null)return null;
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv",""),Base64.NO_WRAP)));
  return new JSONObject(new String(cipher.doFinal(Base64.decode(value,Base64.NO_WRAP)),StandardCharsets.UTF_8));
 }
 static void clear(Context context){context.getSharedPreferences("forte-notifications",0).edit().remove("session").remove("iv").apply();((JobScheduler)context.getSystemService(JOB_SCHEDULER_SERVICE)).cancel(NotificationBridge.JOB_ID);((NotificationManager)context.getSystemService(NOTIFICATION_SERVICE)).cancel(NotificationBridge.NOTICE_ID);}
 static byte[] readBytes(java.io.InputStream input) throws Exception {java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int size;while((size=input.read(buffer))!=-1)out.write(buffer,0,size);return out.toByteArray();}
 static JSONObject post(String target,JSONObject session,JSONObject body,boolean auth) throws Exception {
  HttpURLConnection connection=(HttpURLConnection)new URL(target).openConnection();connection.setRequestMethod("POST");connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setDoOutput(true);connection.setInstanceFollowRedirects(false);
  connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("apikey",session.getString("key"));connection.setRequestProperty("Origin",NotificationBridge.ORIGIN);
  if(auth)connection.setRequestProperty("Authorization","Bearer "+session.getString("access_token"));
  try{connection.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));int code=connection.getResponseCode();if(code==401||(!auth&&code==400))throw new SecurityException("expired");if(code==403)return new JSONObject().put("allowed",false).put("count",0);if(code<200||code>=300)throw new Exception("http");return new JSONObject(new String(readBytes(connection.getInputStream()),StandardCharsets.UTF_8));}finally{connection.disconnect();}
 }
 @Override public boolean onStartJob(JobParameters parameters){task=new Thread(()->{
  boolean retry=false;
  try{JSONObject session=read(this);if(session==null){jobFinished(parameters,false);return;}
   if(!NotificationBridge.PROJECT.equals(session.optString("project"))||!NotificationBridge.APP.equals(session.optString("app"))){clear(this);jobFinished(parameters,false);return;}
   JSONObject state;
   try{state=post(NotificationBridge.PROJECT+"/functions/v1/forte-notifications",session,new JSONObject().put("action","SNAPSHOT"),true);}
   catch(SecurityException expired){
    JSONObject renewed=post(NotificationBridge.PROJECT+"/auth/v1/token?grant_type=refresh_token",session,new JSONObject().put("refresh_token",session.getString("refresh_token")),false);
    if(!renewed.has("access_token")){clear(this);jobFinished(parameters,false);return;}
    session.put("access_token",renewed.getString("access_token")).put("refresh_token",renewed.getString("refresh_token"));store(this,session.toString());
    state=post(NotificationBridge.PROJECT+"/functions/v1/forte-notifications",session,new JSONObject().put("action","SNAPSHOT"),true);
   }
   if(!Thread.currentThread().isInterrupted())NotificationBridge.show(this,state.optBoolean("allowed")?state.optInt("count",0):0);
  }catch(SecurityException invalid){clear(this);}catch(Exception error){retry=true;}
  jobFinished(parameters,retry);
 });task.start();return true;}
 @Override public boolean onStopJob(JobParameters parameters){if(task!=null)task.interrupt();return true;}
}
