package com.lagoinha.kids;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
/** Legacy polling was unauthenticated and unreliable in Doze. Delivery now uses FCM. */
@Deprecated public class EmergencyCallService extends Service {
    public static void start(Context c){} // No boot-time foreground polling.
    public static void stopAlarm(Context c){KidsCallNotifier.dismiss(c);}
    @Override public int onStartCommand(Intent i,int flags,int id){stopSelf();return START_NOT_STICKY;}
    @Override public IBinder onBind(Intent i){return null;}
}
