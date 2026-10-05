package br.com.forteatacarejo.frete;
import android.Manifest;
import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

public final class NotificationBridge {
 private final Activity activity;
 static final int NOTICE_ID=402,JOB_ID=403;
 static final String CHANNEL="forte-pendencias",ORIGIN="https://forte-frete.onrender.com",PROJECT="https://nkynfboqwfxhhxcsrawl.supabase.co",APP="frete";
 NotificationBridge(Activity activity){this.activity=activity;}
 @JavascriptInterface public boolean enabled(){return activity.getSharedPreferences("forte-notifications",0).getBoolean("enabled",false);}
 @JavascriptInterface public void enable(){activity.runOnUiThread(()->{
  activity.getSharedPreferences("forte-notifications",0).edit().putBoolean("enabled",true).apply();
  if(Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},404);
  schedule(activity);
 });}
 @JavascriptInterface public String restoreSession(){try{org.json.JSONObject saved=NotificationJob.read(activity);return saved==null?"":saved.toString();}catch(Exception ignored){return "";}}
 @JavascriptInterface public void syncSession(String value){
  try{if(value==null||value.isEmpty()){NotificationJob.clear(activity);return;}
   JSONObject data=new JSONObject(value);if(!PROJECT.equals(data.optString("project"))||!APP.equals(data.optString("app")))return;
   if(!enabled())return;
   NotificationJob.store(activity,value);schedule(activity);
  }catch(Exception ignored){}
 }
 @JavascriptInterface public void setCount(int count){if(enabled())activity.runOnUiThread(()->show(activity,Math.max(0,count)));}
 static void schedule(Context context){
  JobScheduler scheduler=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
  if(scheduler.getPendingJob(JOB_ID)!=null)return;
  scheduler.schedule(new JobInfo.Builder(JOB_ID,new ComponentName(context,NotificationJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build());
 }
 static void show(Context context,int count){
  NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
  if(count==0){manager.cancel(NOTICE_ID);return;}
  if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
  if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(CHANNEL,"Pendências Forte",NotificationManager.IMPORTANCE_DEFAULT);channel.setShowBadge(true);manager.createNotificationChannel(channel);}
  Intent intent=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent pending=PendingIntent.getActivity(context,NOTICE_ID,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(context,CHANNEL):new Notification.Builder(context);
  builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Forte Frete").setContentText(count+" "+(APP.equals("frete")?"itens disponíveis para verificar":"pendências para verificar")).setNumber(count).setContentIntent(pending).setAutoCancel(false).setOnlyAlertOnce(true);
  manager.notify(NOTICE_ID,builder.build());
 }
}
