package com.lagoinha.kids;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Only communicates with our HTTPS origin. Never logs cookies, names or device tokens. */
public final class NativePagingSession {
    public static final String BASE="https://lagoinha-kids.lagoinha-systems.workers.dev";
    private static final ExecutorService IO=Executors.newSingleThreadExecutor();
    private static volatile long lastSync=0;
    private static volatile String lastUser="";
    public static SharedPreferences prefs(Context c){return c.getSharedPreferences("native_kids_paging_v2",Context.MODE_PRIVATE);}
    public static String userId(Context c){return prefs(c).getString("user_id","");}
    public static void execute(Runnable job){IO.execute(job);}
    public static void sync(Context context,String expectedUser){
        Context c=context.getApplicationContext();
        if(expectedUser==null||expectedUser.isEmpty()){
            lastUser="";lastSync=0;prefs(c).edit().clear().apply();KidsCallNotifier.dismiss(c);return;
        }
        if(expectedUser.equals(lastUser)&&System.currentTimeMillis()-lastSync<300000)return;
        if(!expectedUser.equals(userId(c))){prefs(c).edit().clear().apply();KidsCallNotifier.dismiss(c);}
        lastUser=expectedUser;lastSync=System.currentTimeMillis();
        try{FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->register(c,expectedUser,token)).addOnFailureListener(error->{lastSync=0;});}
        catch(Exception error){lastSync=0;}
    }
    public static void tokenChanged(Context c,String token){String user=userId(c);if(!user.isEmpty())register(c,user,token);}
    private static void register(Context c,String expectedUser,String token){execute(()->{
        try{
            JSONObject me=request("GET","/api/me",null,null);
            String actual=String.valueOf(me.getJSONObject("user").getLong("id"));
            if(!actual.equals(expectedUser)||!stillCurrent(c,expectedUser))return;
            // Establish the verified recipient before the server can dispatch an active call.
            prefs(c).edit().putString("user_id",actual).putBoolean("registered",false).apply();
            JSONObject body=new JSONObject().put("token",token).put("platform","android").put("call_alerts_version",2);
            JSONObject result=request("POST","/api/devices/token",body,me.getString("csrf"));
            if(!stillCurrent(c,expectedUser))return;
            prefs(c).edit().putString("user_id",actual).putBoolean("registered",result.optBoolean("call_alerts",false)).apply();
        }catch(Exception error){lastSync=0;}
    });}
    private static boolean stillCurrent(Context c,String user){return user.equals(lastUser)||(lastUser.isEmpty()&&user.equals(userId(c)));}
    public static JSONObject acknowledge(Context c,int pagingId) throws Exception {
        JSONObject me=request("GET","/api/me",null,null);
        if(!String.valueOf(me.getJSONObject("user").getLong("id")).equals(userId(c)))throw new Exception("account_changed");
        return request("POST","/api/paging/on-my-way",new JSONObject().put("paging_id",pagingId),me.getString("csrf"));
    }
    private static JSONObject request(String method,String path,JSONObject body,String csrf) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(BASE+path).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
        connection.setRequestMethod(method);connection.setRequestProperty("Accept","application/json");
        String cookie=CookieManager.getInstance().getCookie(BASE);
        if(cookie==null||cookie.isEmpty())throw new Exception("login_required");
        connection.setRequestProperty("Cookie",cookie);
        if(csrf!=null)connection.setRequestProperty("X-CSRF-Token",csrf);
        try{
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(java.io.OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            if(connection.getResponseCode()!=200)throw new Exception("http_"+connection.getResponseCode());
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int count;
                while((count=input.read(buffer))!=-1){if(out.size()+count>262144)throw new Exception("response_size");out.write(buffer,0,count);}
                JSONObject result=new JSONObject(out.toString("UTF-8"));
                if("POST".equals(method)&&!result.optBoolean("ok",false))throw new Exception("operation_unconfirmed");
                return result;
            }
        }finally{connection.disconnect();}
    }
    private NativePagingSession(){}
}
