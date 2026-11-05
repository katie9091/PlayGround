package com.blocksmith.studio;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(GummyBearsStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
