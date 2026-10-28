package com.lagoinha.kids;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class KidsMessagingService extends MessagingService {
    @Override public void onMessageReceived(RemoteMessage message){
        Map<String,String> data=message.getData();String type=data.get("type");
        if(!"kids_paging".equals(type)&&!"kids_paging_cancel".equals(type)){super.onMessageReceived(message);return;}
        try{
            String recipient=data.get("user_id");
            if(recipient==null||!recipient.equals(NativePagingSession.userId(this)))return;
            int id=Integer.parseInt(data.get("paging_id"));long expires=Long.parseLong(data.get("expires_at"))*1000L;
            if("kids_paging_cancel".equals(type)){KidsCallNotifier.cancelFromServer(this,id);return;}
            KidsCallNotifier.show(this,id,recipient,expires);
        }catch(Exception ignored){}
    }
    @Override public void onNewToken(String token){super.onNewToken(token);NativePagingSession.tokenChanged(this,token);}
}
