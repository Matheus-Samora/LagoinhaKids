package com.lagoinha.kids;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class EmergencyCallService extends Service {
    private static final String TAG = "LagoinhaEmergency";
    private static final String PREFS_NAME = "lagoinha_prefs";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_USER_ROLE = "user_role";

    public static final String MONITOR_CHANNEL_ID = "lagoinha_monitor_channel";
    public static final String EMERGENCY_CHANNEL_ID = "lagoinha_emergency_channel";
    public static final int MONITOR_NOTIF_ID = 1001;
    public static final int EMERGENCY_NOTIF_ID = 9999;

    private static Ringtone ringtoneInstance = null;
    private static Vibrator vibratorInstance = null;
    private static PowerManager.WakeLock wakeLockInstance = null;

    private ScheduledExecutorService poller;
    private int lastRingingCallId = -1;

    public static void start(Context context) {
        try {
            Intent intent = new Intent(context, EmergencyCallService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start EmergencyCallService", e);
        }
    }

    public static void saveUserInfo(Context context, String userId, String role) {
        try {
            SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            sp.edit().putString(KEY_USER_ID, userId).putString(KEY_USER_ROLE, role).apply();
            Log.i(TAG, "Saved user info: userId=" + userId + ", role=" + role);
        } catch (Exception e) {
            Log.e(TAG, "Failed to save user info", e);
        }
    }

    public static void stopAlarm(Context context) {
        try {
            if (ringtoneInstance != null && ringtoneInstance.isPlaying()) {
                ringtoneInstance.stop();
                ringtoneInstance = null;
            }
            if (vibratorInstance != null) {
                vibratorInstance.cancel();
                vibratorInstance = null;
            }
            if (wakeLockInstance != null && wakeLockInstance.isHeld()) {
                wakeLockInstance.release();
                wakeLockInstance = null;
            }
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(EMERGENCY_NOTIF_ID);
            }
            Log.i(TAG, "Alarm stopped");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping alarm", e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();

        Notification notif = createMonitorNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(MONITOR_NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(MONITOR_NOTIF_ID, notif);
        }

        startPoller();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            NotificationChannel monitorChannel = new NotificationChannel(
                MONITOR_CHANNEL_ID,
                "Monitoramento de Emergência",
                NotificationManager.IMPORTANCE_LOW
            );
            monitorChannel.setDescription("Mantém a detecção de chamadas ativas em segundo plano.");
            monitorChannel.setShowBadge(false);
            nm.createNotificationChannel(monitorChannel);

            NotificationChannel emergencyChannel = new NotificationChannel(
                EMERGENCY_CHANNEL_ID,
                "Chamadas da Salinha (Kids)",
                NotificationManager.IMPORTANCE_HIGH
            );
            emergencyChannel.setDescription("Alertas de emergência e chamados no telão com toque sonoro.");
            emergencyChannel.enableVibration(true);
            emergencyChannel.setVibrationPattern(new long[]{0, 800, 300, 800, 300, 1000});
            emergencyChannel.setBypassDnd(true);
            nm.createNotificationChannel(emergencyChannel);
        }
    }

    private Notification createMonitorNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, intent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        return new NotificationCompat.Builder(this, MONITOR_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Lagoinha Kids Ativo")
            .setContentText("Monitorando chamados de emergência em tempo real.")
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void startPoller() {
        if (poller != null && !poller.isShutdown()) return;
        poller = Executors.newSingleThreadScheduledExecutor();
        poller.scheduleWithFixedDelay(this::checkActivePaging, 1, 3, TimeUnit.SECONDS);
    }

    private void checkActivePaging() {
        try {
            SharedPreferences sp = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String savedUserId = sp.getString(KEY_USER_ID, "");
            String savedRole = sp.getString(KEY_USER_ROLE, "");

            // If no user is logged in, skip check
            if (savedUserId.isEmpty()) return;
            long currentUserId = Long.parseLong(savedUserId);
            boolean isAdmin = "admin".equalsIgnoreCase(savedRole) || "pastor".equalsIgnoreCase(savedRole);

            URL url = new URL("https://lagoinha-kids.lagoinha-systems.workers.dev/api/paging/active");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                JSONArray array = new JSONArray(sb.toString());
                boolean hasActiveCallForUser = false;
                JSONObject targetCall = null;

                for (int i = 0; i < array.length(); i++) {
                    JSONObject obj = array.getJSONObject(i);
                    String status = obj.optString("status", "");
                    if ("active".equalsIgnoreCase(status)) {
                        long parentId = obj.optLong("parent_id", -1);
                        long actor = obj.optLong("actor", -1);

                        // Match if parent of child, actor of test, or admin
                        if (parentId == currentUserId || actor == currentUserId || isAdmin) {
                            hasActiveCallForUser = true;
                            targetCall = obj;
                            break;
                        }
                    }
                }

                if (hasActiveCallForUser && targetCall != null) {
                    int callId = targetCall.optInt("id", -1);
                    if (callId != lastRingingCallId) {
                        lastRingingCallId = callId;
                        triggerIncomingCallAlarm(targetCall);
                    }
                } else {
                    if (lastRingingCallId != -1) {
                        lastRingingCallId = -1;
                        stopAlarm(this);
                    }
                }
            }
            conn.disconnect();
        } catch (Exception ignored) {}
    }

    private void triggerIncomingCallAlarm(JSONObject call) {
        try {
            String childName = call.optString("child_name", "Seu Filho(a)");
            String claimCode = call.optString("claim_code", "");
            String reason = call.optString("reason", "Acolhimento da família necessário");
            String roomName = call.optString("room_name", "Salinha");

            Log.w(TAG, "🚨 TRIGGERING INCOMING CALL ALARM: " + childName + " (" + claimCode + ")");

            // 1. Turn screen on
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                if (wakeLockInstance != null && wakeLockInstance.isHeld()) wakeLockInstance.release();
                wakeLockInstance = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "LagoinhaKids:EmergencyWakeLock"
                );
                wakeLockInstance.acquire(45000);
            }

            // 2. Play ringtone
            try {
                if (ringtoneInstance == null || !ringtoneInstance.isPlaying()) {
                    Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                    if (soundUri == null) soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    ringtoneInstance = RingtoneManager.getRingtone(getApplicationContext(), soundUri);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        AudioAttributes aa = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build();
                        ringtoneInstance.setAudioAttributes(aa);
                    }
                    ringtoneInstance.play();
                }
            } catch (Exception re) {
                Log.e(TAG, "Failed to play ringtone", re);
            }

            // 3. Vibrate
            try {
                if (vibratorInstance == null) {
                    vibratorInstance = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    if (vibratorInstance != null && vibratorInstance.hasVibrator()) {
                        long[] pattern = new long[]{0, 800, 300, 800, 300, 1000};
                        vibratorInstance.vibrate(pattern, 0);
                    }
                }
            } catch (Exception ve) {
                Log.e(TAG, "Failed to vibrate", ve);
            }

            // 4. Launch MainActivity with Full-Screen Intent over lock screen
            Intent fullScreenIntent = new Intent(this, MainActivity.class);
            fullScreenIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            );
            fullScreenIntent.putExtra("is_emergency_call", true);
            fullScreenIntent.putExtra("child_name", childName);
            fullScreenIntent.putExtra("claim_code", claimCode);

            PendingIntent pi = PendingIntent.getActivity(
                this,
                call.optInt("id", 1),
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            NotificationCompat.Builder notif = new NotificationCompat.Builder(this, EMERGENCY_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("🚨 CHAMADA DA SALINHA: " + childName)
                .setContentText("Código " + claimCode + " no telão · " + roomName + " · " + reason)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(EMERGENCY_NOTIF_ID, notif.build());
            }

            // Directly start activity to bring over lock screen
            startActivity(fullScreenIntent);

        } catch (Exception e) {
            Log.e(TAG, "Error in triggerIncomingCallAlarm", e);
        }
    }

    @Override
    public void onDestroy() {
        if (poller != null) {
            poller.shutdownNow();
            poller = null;
        }
        stopAlarm(this);
        super.onDestroy();
    }
}
