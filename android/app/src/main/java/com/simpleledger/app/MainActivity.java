package com.simpleledger.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 旧版本在 App 内注册了 Service Worker，升级后残留的 SW 会缓存旧 index.html，
        // 而新版本资源文件名带哈希已经变化，导致页面加载失败白屏。这里在 WebView 初始化前
        // 清掉 SW 注册和缓存（IndexedDB 等用户数据不受影响）。
        clearServiceWorkerStorage();
        super.onCreate(savedInstanceState);
    }

    private void clearServiceWorkerStorage() {
        try {
            File swDir = new File(getDataDir(), "app_webview/Service Worker");
            if (swDir.exists()) {
                deleteRecursively(swDir);
                Log.i("MainActivity", "Cleared stale service worker storage");
            }
        } catch (Exception error) {
            Log.w("MainActivity", "Failed to clear service worker storage", error);
        }
    }

    private void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }
}
