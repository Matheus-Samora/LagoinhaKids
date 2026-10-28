package com.lagoinha.kids;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public class WebAppInterface {
        Context context;

        WebAppInterface(Context c) {
            this.context = c;
        }

        @JavascriptInterface
        public void syncUser(String userId, String role) {
            EmergencyCallService.saveUserInfo(context, userId, role);
        }

        @JavascriptInterface
        public void stopCall() {
            EmergencyCallService.stopAlarm(context);
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        configureWindowOverLockscreen();

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);

                webView.addJavascriptInterface(new WebAppInterface(this), "AndroidNativeApp");
            }
        } catch (Exception ignored) {}

        // Start background emergency call monitoring service
        EmergencyCallService.start(this);
    }

    private void configureWindowOverLockscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            try {
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null) {
                    km.requestDismissKeyguard(this, null);
                }
            } catch (Exception ignored) {}
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        configureWindowOverLockscreen();
    }
}
