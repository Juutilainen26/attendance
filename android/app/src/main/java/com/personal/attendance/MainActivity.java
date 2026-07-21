package com.personal.attendance;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends AppCompatActivity {

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> filePicker;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        filePicker = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (filePathCallback == null) return;
                    Uri[] uris = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        Uri u = result.getData().getData();
                        if (u != null) uris = new Uri[]{u};
                    }
                    filePathCallback.onReceiveValue(uris);
                    filePathCallback = null;
                });

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage 사용
        s.setAllowFileAccess(true);
        s.setTextZoom(100);                     // 시스템 글꼴 크기 영향 차단
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);

        web.setBackgroundColor(0xFF12141A);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                try {
                    filePicker.launch(params.createIntent());
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        web.loadUrl("file:///android_asset/index.html");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });
    }

    /** 웹 화면에서 백업 파일을 '다운로드' 폴더에 저장할 수 있게 해주는 통로 */
    public class Bridge {
        @JavascriptInterface
        public void saveText(final String fileName, final String content) {
            String msg;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    Uri uri = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new Exception("uri null");
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(content.getBytes("UTF-8"));
                    os.close();
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, fileName);
                    FileOutputStream fo = new FileOutputStream(f);
                    fo.write(content.getBytes("UTF-8"));
                    fo.close();
                }
                msg = "다운로드 폴더에 저장했습니다: " + fileName;
            } catch (Exception e) {
                msg = "저장 실패: " + e.getMessage();
            }
            final String out = msg;
            runOnUiThread(() -> Toast.makeText(MainActivity.this, out, Toast.LENGTH_LONG).show());
        }
    }
}
