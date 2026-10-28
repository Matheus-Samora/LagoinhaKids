package com.lagoinha.kids;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.ContextCompat;

/** Native UI is available even when the WebView has not started or the screen is locked. */
public class IncomingCallActivity extends Activity {
    private int pagingId;private long expires;private TextView status;private boolean registered=false;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final BroadcastReceiver dismissed=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){finish();}};
    private final Runnable expiry=()->{KidsCallNotifier.dismissIfCurrent(this,pagingId);finish();};
    @Override public void onCreate(Bundle bundle){
        super.onCreate(bundle);pagingId=getIntent().getIntExtra("paging_id",-1);expires=getIntent().getLongExtra("expires_at",0);
        if(pagingId<=0||expires<=System.currentTimeMillis()||NativePagingSession.userId(this).isEmpty()){finish();return;}
        if(Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true);}else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED|WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setGravity(Gravity.CENTER);layout.setPadding(32,36,32,36);layout.setBackgroundColor(Color.rgb(18,18,21));
        TextView title=new TextView(this);title.setText("A equipe Kids\nestá chamando");title.setTextSize(30);title.setTextColor(Color.WHITE);title.setGravity(Gravity.CENTER);layout.addView(title);
        status=new TextView(this);status.setText("Sua família precisa comparecer à recepção Kids.\nEste é um alerta do aplicativo, sem chamada de voz.");status.setTextSize(18);status.setTextColor(Color.LTGRAY);status.setPadding(0,32,0,32);status.setGravity(Gravity.CENTER);layout.addView(status);
        int touch=(int)(64*getResources().getDisplayMetrics().density);
        Button acknowledge=new Button(this);acknowledge.setText("Estou a caminho");layout.addView(acknowledge,new LinearLayout.LayoutParams(-1,touch));
        Button open=new Button(this);open.setText("Abrir aplicativo");layout.addView(open,new LinearLayout.LayoutParams(-1,touch));
        Button silence=new Button(this);silence.setText("Silenciar");layout.addView(silence,new LinearLayout.LayoutParams(-1,touch));
        acknowledge.setOnClickListener(v->unlockThen(()->{
            acknowledge.setEnabled(false);status.setText("Confirmando com a equipe…");
            NativePagingSession.execute(()->{try{
                org.json.JSONObject result=NativePagingSession.acknowledge(this,pagingId);
                if(!"on_my_way".equals(result.optString("status"))&&!"resolved".equals(result.optString("status")))throw new Exception("unconfirmed");
                runOnUiThread(()->{KidsCallNotifier.dismissIfCurrent(this,pagingId);finish();});
            }catch(Exception error){runOnUiThread(()->{status.setText("Não foi possível confirmar. Confira sua conexão ou abra o aplicativo para entrar novamente.");acknowledge.setEnabled(true);});}});
        }));
        open.setOnClickListener(v->unlockThen(()->{KidsCallNotifier.dismissIfCurrent(this,pagingId);startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));finish();}));
        silence.setOnClickListener(v->{KidsCallNotifier.dismissIfCurrent(this,pagingId);finish();});
        setContentView(layout);
        ContextCompat.registerReceiver(this,dismissed,new IntentFilter("com.lagoinha.kids.CALL_DISMISSED"),ContextCompat.RECEIVER_NOT_EXPORTED);registered=true;
        handler.postDelayed(expiry,Math.min(60000,expires-System.currentTimeMillis()));
    }
    private void unlockThen(Runnable next){
        KeyguardManager manager=(KeyguardManager)getSystemService(KEYGUARD_SERVICE);
        if(Build.VERSION.SDK_INT<26&&manager.isKeyguardLocked()){status.setText("Desbloqueie o celular e abra o aplicativo para confirmar com a equipe.");return;}
        if(Build.VERSION.SDK_INT>=26&&manager.isKeyguardLocked())manager.requestDismissKeyguard(this,new KeyguardManager.KeyguardDismissCallback(){@Override public void onDismissSucceeded(){next.run();}@Override public void onDismissCancelled(){status.setText("Desbloqueie o celular para confirmar com a equipe.");}});
        else next.run();
    }
    @Override protected void onDestroy(){handler.removeCallbacks(expiry);if(registered)unregisterReceiver(dismissed);super.onDestroy();}
    @Override public void onBackPressed(){KidsCallNotifier.dismissIfCurrent(this,pagingId);super.onBackPressed();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);if(intent.getIntExtra("paging_id",-1)!=pagingId){setIntent(intent);recreate();}}
}
