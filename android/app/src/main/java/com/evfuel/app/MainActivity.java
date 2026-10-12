package com.evfuel.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // il plugin del widget va registrato PRIMA di super.onCreate
        registerPlugin(EvfuelWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
