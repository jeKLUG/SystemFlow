package de.systemhausess.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import de.systemhausess.app.databinding.ActivityMainBinding

/**
 * Schlanke WebView-Hülle für die Systemhaus-Ess Web-App.
 * Start-URL ist über Menü anpassbar und wird lokal gespeichert.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val prefs by lazy {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            filePathCallback?.onReceiveValue(uris)
            filePathCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(top = bars.top, bottom = bars.bottom)
            insets
        }

        setupWebView()
        binding.btnRetry.setOnClickListener { loadHome() }
        binding.btnChangeUrl.setOnClickListener { showServerDialog() }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (binding.webView.canGoBack()) binding.webView.goBack()
                    else finish()
                }
            },
        )

        if (savedInstanceState != null) {
            binding.webView.restoreState(savedInstanceState)
        } else {
            loadHome()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        binding.webView.saveState(outState)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_RELOAD, 0, R.string.action_reload)
        menu.add(0, MENU_HOME, 1, R.string.action_home)
        menu.add(0, MENU_SERVER, 2, R.string.action_server)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            MENU_RELOAD -> {
                binding.webView.reload()
                true
            }
            MENU_HOME -> {
                loadHome()
                true
            }
            MENU_SERVER -> {
                showServerDialog()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(binding.webView, true)

        binding.webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            allowFileAccess = true
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = false
        }

        binding.webView.webViewClient =
            object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url ?: return false
                    return handleExternal(url)
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    binding.progress.visibility = View.VISIBLE
                    binding.offline.visibility = View.GONE
                    binding.webView.visibility = View.VISIBLE
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    binding.progress.visibility = View.GONE
                    CookieManager.getInstance().flush()
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (request.isForMainFrame) showOffline()
                }
            }

        binding.webView.webChromeClient =
            object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    binding.progress.progress = newProgress
                    binding.progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?,
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                    return try {
                        fileChooser.launch(intent)
                        true
                    } catch (_: ActivityNotFoundException) {
                        this@MainActivity.filePathCallback = null
                        Toast.makeText(this@MainActivity, "Keine Datei-App gefunden", Toast.LENGTH_SHORT).show()
                        false
                    }
                }
            }
    }

    private fun handleExternal(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme == "http" || scheme == "https") {
            val home = Uri.parse(currentUrl())
            if (uri.host == home.host) return false
        }
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }

    private fun currentUrl(): String {
        val stored = prefs.getString(KEY_URL, null)?.trim().orEmpty()
        return if (stored.isNotEmpty()) stored else BuildConfig.DEFAULT_APP_URL
    }

    private fun loadHome() {
        val url = normalizeUrl(currentUrl())
        binding.offline.visibility = View.GONE
        binding.webView.visibility = View.VISIBLE
        binding.webView.loadUrl(url)
    }

    private fun showOffline() {
        binding.webView.visibility = View.GONE
        binding.progress.visibility = View.GONE
        binding.offline.visibility = View.VISIBLE
    }

    private fun showServerDialog() {
        val input = EditText(this).apply {
            setText(currentUrl())
            hint = getString(R.string.server_dialog_hint)
            setSingleLine()
            setPadding(48, 32, 48, 32)
        }
        val container = FrameLayout(this).apply {
            addView(input)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.server_dialog_title)
            .setView(container)
            .setPositiveButton(R.string.server_dialog_save) { _, _ ->
                val next = normalizeUrl(input.text?.toString().orEmpty())
                if (!URLUtil.isNetworkUrl(next)) {
                    Toast.makeText(this, "Ungültige URL", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                prefs.edit().putString(KEY_URL, next).apply()
                loadHome()
            }
            .setNegativeButton(R.string.server_dialog_cancel, null)
            .show()
    }

    private fun normalizeUrl(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isEmpty()) return BuildConfig.DEFAULT_APP_URL
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed
        else "http://$trimmed"
    }

    companion object {
        private const val PREFS = "systemhaus_shell"
        private const val KEY_URL = "app_url"
        private const val MENU_RELOAD = 1
        private const val MENU_HOME = 2
        private const val MENU_SERVER = 3
    }
}
