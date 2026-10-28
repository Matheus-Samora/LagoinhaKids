package com.lagoinha.kids;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

public final class KidsCallNotifier {
    static final String CHANNEL="kids_family_calls_v2";
    static final int NOTIFICATION=24001;
    public static boolean notificationsAllowed(Context c){return NotificationManagerCompat.from(c).areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
    public static boolean fullScreenAllowed(Context c){return Build.VERSION.SDK_INT<34||((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).canUseFullScreenIntent();}
    public static void channel(Context c){
        if(Build.VERSION.SDK_INT<26)return;
        NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel=new NotificationChannel(CHANNEL,"Chamados da equipe Kids",NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Aviso sonoro e visual quando a equipe Kids chama sua família.");
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
        channel.enableVibration(true);channel.setVibrationPattern(new long[]{0,700,300,700});
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);nm.createNotificationChannel(channel);
    }
    public static boolean accepts(String expectedUser,String recipient,int id,long expires,long now){return id>0&&!expectedUser.isEmpty()&&expectedUser.equals(recipient)&&expires>now&&expires<=now+660000;}
    public static void show(Context source,int id,String recipient,long expires){
        Context c=source.getApplicationContext();
        if(!accepts(NativePagingSession.userId(c),recipient,id,expires,System.currentTimeMillis()))return;
        if(NativePagingSession.prefs(c).getStringSet("cancelled_ids",java.util.Collections.emptySet()).contains(String.valueOf(id)))return;
        channel(c);if(!notificationsAllowed(c))return;
        NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26&&nm.getNotificationChannel(CHANNEL).getImportance()==NotificationManager.IMPORTANCE_NONE)return;
        if(NativePagingSession.prefs(c).getInt("seen_id",-1)==id)return;
        Intent screen=new Intent(c,IncomingCallActivity.class).putExtra("paging_id",id).putExtra("expires_at",expires);
        screen.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open=PendingIntent.getActivity(c,id,screen,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent silence=new Intent(c,KidsCallActionReceiver.class).setAction("kids.SILENCE").putExtra("paging_id",id);
        PendingIntent mute=PendingIntent.getBroadcast(c,id,silence,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(c,CHANNEL)
            .setSmallIcon(R.drawable.ic_kids_call).setContentTitle("A equipe Kids está chamando")
            .setContentText("Toque para ver o chamado e avisar que está a caminho.")
            .setCategory(NotificationCompat.CATEGORY_REMINDER).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(open).setDeleteIntent(mute)
            .setAutoCancel(false).setTimeoutAfter(Math.min(60000,expires-System.currentTimeMillis()))
            .addAction(R.drawable.ic_kids_call,"Ver chamado",open).addAction(0,"Silenciar",mute);
        if(fullScreenAllowed(c))builder.setFullScreenIntent(open,true);
        Notification notification=builder.build();notification.flags|=Notification.FLAG_INSISTENT;
        nm.notify(NOTIFICATION,notification);
        NativePagingSession.prefs(c).edit().putInt("active_id",id).putInt("seen_id",id).putLong("expires_at",expires).apply();
        // Never start an activity directly from a background service. Android controls FSI.
    }
    public static void dismiss(Context c){
        ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIFICATION);
        NativePagingSession.prefs(c).edit().remove("active_id").remove("expires_at").apply();
        c.sendBroadcast(new Intent("com.lagoinha.kids.CALL_DISMISSED").setPackage(c.getPackageName()));
    }
    public static void dismissIfCurrent(Context c,int id){if(NativePagingSession.prefs(c).getInt("active_id",-1)==id)dismiss(c);}
    public static void cancelFromServer(Context c,int id){
        java.util.Set<String> cancelled=new java.util.HashSet<>(NativePagingSession.prefs(c).getStringSet("cancelled_ids",java.util.Collections.emptySet()));
        if(cancelled.size()>=64)cancelled.clear();cancelled.add(String.valueOf(id));
        NativePagingSession.prefs(c).edit().putStringSet("cancelled_ids",cancelled).apply();dismissIfCurrent(c,id);
    }
    public static String status(Context c){
        channel(c);JSONObject value=new JSONObject();
        try{
            boolean channelEnabled=Build.VERSION.SDK_INT<26||((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).getNotificationChannel(CHANNEL).getImportance()>=NotificationManager.IMPORTANCE_HIGH;
            value.put("notifications_allowed",notificationsAllowed(c));value.put("full_screen_allowed",fullScreenAllowed(c));value.put("channel_enabled",channelEnabled);
            AudioManager audio=(AudioManager)c.getSystemService(Context.AUDIO_SERVICE);
            boolean sound=(Build.VERSION.SDK_INT<26||((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).getNotificationChannel(CHANNEL).getSound()!=null)&&audio.getRingerMode()==AudioManager.RINGER_MODE_NORMAL&&audio.getStreamVolume(AudioManager.STREAM_RING)>0;
            value.put("sound_enabled",sound);
            value.put("registered",NativePagingSession.prefs(c).getBoolean("registered",false));value.put("version",2);
        }catch(Exception ignored){}
        return value.toString();
    }
    private KidsCallNotifier(){}
}
