# Keep default ProGuard rules; minify is off for the WebView shell.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
