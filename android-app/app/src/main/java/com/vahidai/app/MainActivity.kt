package com.vahidai.app

import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.view.ViewGroup

class MainActivity : Activity() {
  @Suppress("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val web = WebView(this)
    web.webViewClient = WebViewClient()
    web.webChromeClient = WebChromeClient()
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.settings.cacheMode = WebSettings.LOAD_DEFAULT
    web.settings.allowFileAccess = true
    web.settings.allowContentAccess = true
    web.loadUrl("file:///android_asset/index.html")
    setContentView(web)
  }
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    val web = (window.decorView.findViewById(android.R.id.content) as? ViewGroup)?.getChildAt(0) as? WebView
    if (web != null && web.canGoBack()) web.goBack() else super.onBackPressed()
  }
}
