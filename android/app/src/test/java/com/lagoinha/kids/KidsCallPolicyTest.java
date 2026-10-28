package com.lagoinha.kids;
import org.junit.Test;
import static org.junit.Assert.*;
public class KidsCallPolicyTest {
    @Test public void acceptsOnlyCurrentRecipientAndFreshCall(){
        assertTrue(KidsCallNotifier.accepts("3","3",1,120000,100000));
        assertFalse(KidsCallNotifier.accepts("3","4",1,120000,100000));
        assertFalse(KidsCallNotifier.accepts("","3",1,120000,100000));
        assertFalse(KidsCallNotifier.accepts("3","3",-1,120000,100000));
        assertFalse(KidsCallNotifier.accepts("3","3",1,90000,100000));
        assertFalse(KidsCallNotifier.accepts("3","3",1,9999999,100000));
    }
}
