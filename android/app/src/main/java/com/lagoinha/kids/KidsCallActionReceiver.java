package com.lagoinha.kids;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public class KidsCallActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){KidsCallNotifier.dismissIfCurrent(context,intent.getIntExtra("paging_id",-1));}
}
