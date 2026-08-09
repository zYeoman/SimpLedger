package com.simpleledger.app;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SimpLedger";
    private int lastImeHeight = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 旧版本在 App 内注册了 Service Worker，升级后残留的 SW 会缓存旧 index.html，
        // 而新版本资源文件名带哈希已经变化，导致页面加载失败白屏。这里在 WebView 初始化前
        // 清掉 SW 注册和缓存（IndexedDB 等用户数据不受影响）。
        clearServiceWorkerStorage();
        super.onCreate(savedInstanceState);
        setupKeyboardOverlay();
    }

    /**
     * 键盘像网页版一样浮在内容上方，窗口本身不 resize（manifest adjustNothing 保证）。
     * 通过 insets 动画监听向 JS 汇报键盘高度（AI 聊天输入框避让）；同时在父容器
     * 拦截 insets 原样返回，停用 M139+ WebView 的新式视口调整，避免 dvh 页面
     * （新建记账等）在键盘弹出时被顶起。JS 侧 native 优先、visualViewport 兜底。
     */
    private void setupKeyboardOverlay() {
        getBridge().getWebView().post(() -> {
            WebView webView = getBridge().getWebView();
            // 关闭 WebView 原生过滚动效果（Android 12+ 整页拉伸 + 边缘光晕）
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            View parent = (View) webView.getParent();

            // Android 11+ 官方键盘 inset 动画
            ViewCompat.setWindowInsetsAnimationCallback(parent, new WindowInsetsAnimationCompat.Callback(
                    WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_STOP) {
                @Override
                public WindowInsetsCompat onProgress(WindowInsetsCompat insets, List<WindowInsetsAnimationCompat> runningAnimations) {
                    notifyKeyboardHeight(insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
                    // 剥离 ime inset，避免 WebView 在动画期间收到键盘 inset 触发视口收缩
                    return new WindowInsetsCompat.Builder(insets)
                        .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                        .build();
                }
            });
            // 拦截 insets：读取键盘高度后剥离 ime 再向下传递，停用 M139+ WebView 的
            // 新式视口调整；系统栏/刘海 inset 不受影响
            ViewCompat.setOnApplyWindowInsetsListener(parent, (view, insets) -> {
                // 清掉父容器可能被系统应用上的 inset padding，避免页面顶部多出间距
                view.setPadding(0, 0, 0, 0);
                notifyKeyboardHeight(insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
                return new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .build();
            });
            webView.requestApplyInsets();
        });
    }

    private void notifyKeyboardHeight(int heightPx) {
        if (heightPx == lastImeHeight) return;
        lastImeHeight = heightPx;
        Log.i(TAG, "keyboard height px: " + heightPx);
        if (getBridge() != null && getBridge().getWebView() != null) {
            // Capacitor 的 triggerEvent 只在 eventData 是对象时才会复制属性到事件上，
            // 传纯数字会让 detail 丢失，所以这里传 JSON 对象
            getBridge().triggerWindowJSEvent("localMoneyKeyboardHeight", "{\"detail\":" + heightPx + "}");
        }
    }

    private void clearServiceWorkerStorage() {
        try {
            File swDir = new File(getDataDir(), "app_webview/Service Worker");
            if (swDir.exists()) {
                deleteRecursively(swDir);
                Log.i(TAG, "Cleared stale service worker storage");
            }
        } catch (Exception error) {
            Log.w(TAG, "Failed to clear service worker storage", error);
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
