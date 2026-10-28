package com.lagoinha.kids;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public class WebAppInterface {
        @JavascriptInterface public void syncUser(String id,String role){NativePagingSession.sync(MainActivity.this,id);}
        @JavascriptInterface public void stopCall(){KidsCallNotifier.dismiss(MainActivity.this);}
        @JavascriptInterface public boolean isNativeApp(){return true;}
        @JavascriptInterface public int callAlertsVersion(){return 2;}
        @JavascriptInterface public String getCallAlertStatus(){return KidsCallNotifier.status(MainActivity.this);}
        @JavascriptInterface public void presentCall(String id,String expiry){
            try{KidsCallNotifier.show(MainActivity.this,Integer.parseInt(id),NativePagingSession.userId(MainActivity.this),Long.parseLong(expiry));}catch(Exception ignored){}
        }
        @JavascriptInterface public void requestCallPermissions(){runOnUiThread(()->{
            if(Build.VERSION.SDK_INT>=33&&!KidsCallNotifier.notificationsAllowed(MainActivity.this)&&(!NativePagingSession.prefs(MainActivity.this).getBoolean("asked_notification_permission",false)||ActivityCompat.shouldShowRequestPermissionRationale(MainActivity.this,Manifest.permission.POST_NOTIFICATIONS))){
                NativePagingSession.prefs(MainActivity.this).edit().putBoolean("asked_notification_permission",true).apply();
                ActivityCompat.requestPermissions(MainActivity.this,new String[]{Manifest.permission.POST_NOTIFICATIONS},240);
            }
            else openNotificationSettings();
        });}
        @JavascriptInterface public void openFullScreenSettings(){runOnUiThread(()->{
            if(Build.VERSION.SDK_INT>=34)openSystemSettings(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,Uri.parse("package:"+getPackageName())));
            else openNotificationSettings();
        });}
    }
    private void openNotificationSettings(){
        Intent intent=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName());
        if(Build.VERSION.SDK_INT>=26)intent=new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID,KidsCallNotifier.CHANNEL);
        openSystemSettings(intent);
    }
    private void openSystemSettings(Intent intent){try{startActivity(intent);}catch(Exception unavailable){startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        // Stop the obsolete polling service from older installations, without restarting it.
        stopService(new Intent(this,EmergencyCallService.class));
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        manager.cancel(1001);manager.cancel(9999);
        KidsCallNotifier.channel(this);
        if(getBridge()!=null&&getBridge().getWebView()!=null){
            WebView web=getBridge().getWebView();web.getSettings().setMediaPlaybackRequiresUserGesture(false);
            web.addJavascriptInterface(new WebAppInterface(),"AndroidNativeApp");
        }
    }
}
