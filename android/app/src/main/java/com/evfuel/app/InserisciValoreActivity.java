package com.evfuel.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

/**
 * Piccola finestra aperta toccando un campo del widget "Verifica consumo":
 * si inserisce il valore con la tastiera e il widget si aggiorna.
 */
public class InserisciValoreActivity extends Activity {

    static final String EXTRA_CAMPO = "campo";

    private String campo = "kmtot";
    private EditText campoTesto;

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        String c = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_CAMPO);
        if (c != null) campo = c;

        String titolo, chiave;
        switch (campo) {
            case "kmparz":
                titolo = "Km parziali";
                chiave = ConsumoWidgetProvider.K_KMPARZ;
                break;
            case "pct":
                titolo = "Batteria attuale (%)";
                chiave = ConsumoWidgetProvider.K_PCT;
                break;
            default:
                titolo = "Km totali";
                chiave = ConsumoWidgetProvider.K_KMTOT;
                break;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(16), dp(18), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF0A0F1E);
        bg.setCornerRadius(dp(16));
        root.setBackground(bg);

        TextView t = new TextView(this);
        t.setText(titolo);
        t.setTextColor(0xFFE5E7EB);
        t.setTextSize(17);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(t);

        campoTesto = new EditText(this);
        campoTesto.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        campoTesto.setImeOptions(EditorInfo.IME_ACTION_DONE);
        campoTesto.setSingleLine(true);
        campoTesto.setTextColor(0xFFE5E7EB);
        campoTesto.setHintTextColor(0xFF6B7280);
        campoTesto.setHint(titolo);
        campoTesto.setTextSize(20);
        campoTesto.setPadding(dp(12), 0, dp(12), 0);
        GradientDrawable box = new GradientDrawable();
        box.setColor(0xFF141B2E);
        box.setStroke(dp(1), 0xFF263149);
        box.setCornerRadius(dp(10));
        campoTesto.setBackground(box);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(12);
        campoTesto.setLayoutParams(lp);

        Double attuale = ConsumoWidgetProvider.leggiNum(this, chiave);
        if (attuale != null) {
            campoTesto.setText(String.format(Locale.US, "%d", Math.round(attuale)));
            campoTesto.selectAll();
        }
        campoTesto.setOnEditorActionListener((v, actionId, ev) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                conferma();
                return true;
            }
            return false;
        });
        root.addView(campoTesto);

        LinearLayout riga = new LinearLayout(this);
        riga.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rp.topMargin = dp(14);
        riga.setLayoutParams(rp);
        riga.addView(bottone("Annulla", 0xFF263149, v -> finish()), pesi(0, 5));
        riga.addView(bottone("OK", 0xFF0EA5E9, v -> conferma()), pesi(5, 0));
        root.addView(riga);

        setContentView(root);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
                | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        campoTesto.requestFocus();
    }

    private LinearLayout.LayoutParams pesi(int sx, int dx) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(46), 1f);
        p.setMargins(dp(sx), 0, dp(dx), 0);
        return p;
    }

    private TextView bottone(String testo, int colore, View.OnClickListener l) {
        TextView t = new TextView(this);
        t.setText(testo);
        t.setTextColor(Color.WHITE);
        t.setTextSize(15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable();
        g.setColor(colore);
        g.setCornerRadius(dp(12));
        t.setBackground(g);
        t.setOnClickListener(l);
        return t;
    }

    private void conferma() {
        try {
            SharedPreferences sp = getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE);
            String txt = campoTesto.getText().toString().trim().replace(',', '.');
            Double v = null;
            if (!txt.isEmpty()) {
                try {
                    v = Double.parseDouble(txt);
                } catch (Exception ignored) {
                }
            }
            double[] base = ConsumoWidgetProvider.base(this);
            double kmBase = base == null ? 0 : base[0];
            SharedPreferences.Editor ed = sp.edit();
            String vs = v == null ? "" : String.valueOf(Math.round(v));
            switch (campo) {
                case "kmparz":
                    ed.putString(ConsumoWidgetProvider.K_KMPARZ, vs);
                    ed.putString(ConsumoWidgetProvider.K_KMTOT, v == null ? "" : String.valueOf(Math.round(kmBase + v)));
                    break;
                case "pct":
                    ed.putString(ConsumoWidgetProvider.K_PCT, vs);
                    break;
                default:
                    ed.putString(ConsumoWidgetProvider.K_KMTOT, vs);
                    ed.putString(ConsumoWidgetProvider.K_KMPARZ, v == null ? "" : String.valueOf(Math.round(Math.max(0, v - kmBase))));
                    break;
            }
            ed.apply();
            ConsumoWidgetProvider.sincronizzaRisultato(this);
            ConsumoWidgetProvider.aggiornaTutti(this);
            EvfuelWidgetProvider.aggiornaTutti(this);
        } catch (Exception ignored) {
        }
        finish();
    }
}
