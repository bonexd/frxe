package com.bloodvitr.vitr;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public final class MainActivity extends Activity {
    private WebView webView;
    private boolean pageReady = false;
    private int safeTop = 0;
    private int safeBottom = 0;
    private int safeLeft = 0;
    private int safeRight = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(5, 5, 7));
        window.setNavigationBarColor(Color.rgb(5, 5, 7));
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 5, 7));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 5, 7));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                pushDeviceProfile();
            }
        });

        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(webView, webParams);
        setContentView(root);

        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int top;
            int bottom;
            int left;
            int right;

            if (android.os.Build.VERSION.SDK_INT >= 30) {
                Insets barsAndCutout = insets.getInsets(
                    WindowInsets.Type.statusBars()
                        | WindowInsets.Type.navigationBars()
                        | WindowInsets.Type.displayCutout()
                );
                Insets gestures = insets.getInsets(
                    WindowInsets.Type.systemGestures()
                        | WindowInsets.Type.mandatorySystemGestures()
                );

                top = barsAndCutout.top;
                bottom = Math.max(barsAndCutout.bottom, gestures.bottom);
                left = Math.max(barsAndCutout.left, gestures.left);
                right = Math.max(barsAndCutout.right, gestures.right);
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft();
                right = insets.getSystemWindowInsetRight();
            }

            safeTop = top;
            safeBottom = bottom;
            safeLeft = left;
            safeRight = right;

            Configuration config = getResources().getConfiguration();
            float density = getResources().getDisplayMetrics().density;
            int smallestDp = config.smallestScreenWidthDp > 0
                ? config.smallestScreenWidthDp
                : Math.min(config.screenWidthDp, config.screenHeightDp);

            float extraTopDp;
            if (smallestDp >= 600) {
                extraTopDp = 12f;
            } else if (smallestDp < 360) {
                extraTopDp = 6f;
            } else {
                extraTopDp = 8f;
            }
            int extraTopPx = Math.round(extraTopDp * density);

            FrameLayout.LayoutParams params =
                (FrameLayout.LayoutParams) webView.getLayoutParams();
            params.topMargin = top + extraTopPx;
            params.bottomMargin = bottom;
            params.leftMargin = left;
            params.rightMargin = right;
            webView.setLayoutParams(params);

            pushDeviceProfile();
            return insets;
        });

        root.requestApplyInsets();
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void pushDeviceProfile() {
        if (!pageReady || webView == null) return;

        Configuration config = getResources().getConfiguration();
        float density = getResources().getDisplayMetrics().density;
        int widthDp = config.screenWidthDp;
        int heightDp = config.screenHeightDp;
        int smallestDp = config.smallestScreenWidthDp > 0
            ? config.smallestScreenWidthDp
            : Math.min(widthDp, heightDp);

        String deviceClass;
        if (smallestDp >= 600) {
            deviceClass = "tablet";
        } else if (smallestDp < 360) {
            deviceClass = "compact";
        } else {
            deviceClass = "phone";
        }

        String orientation =
            config.orientation == Configuration.ORIENTATION_LANDSCAPE
                ? "landscape"
                : "portrait";

        int safeTopDp = Math.round(safeTop / density);
        int safeBottomDp = Math.round(safeBottom / density);
        int safeLeftDp = Math.round(safeLeft / density);
        int safeRightDp = Math.round(safeRight / density);
        int densityDpi = getResources().getDisplayMetrics().densityDpi;

        String script =
            "window.__vitrApplyDeviceProfile && window.__vitrApplyDeviceProfile({" +
            "deviceClass:'" + deviceClass + "'," +
            "orientation:'" + orientation + "'," +
            "widthDp:" + widthDp + "," +
            "heightDp:" + heightDp + "," +
            "smallestDp:" + smallestDp + "," +
            "densityDpi:" + densityDpi + "," +
            "safeTop:" + safeTopDp + "," +
            "safeBottom:" + safeBottomDp + "," +
            "safeLeft:" + safeLeftDp + "," +
            "safeRight:" + safeRightDp +
            "});";

        webView.evaluateJavascript(script, null);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
