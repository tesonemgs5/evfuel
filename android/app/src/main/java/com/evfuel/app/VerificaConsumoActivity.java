package com.evfuel.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Mini-finestra "Verifica consumo" aperta toccando il widget.
 * Stessa logica del pannello dell'app: km totali / km parziali / batteria attuale -> kWh/100km.
 * Il risultato viene salvato e mostrato sul widget.
 */
public class VerificaConsumoActivity extends Activity {

    private double kmBase = 0, pctDopo = 0, batteria = 0;
    private boolean datiOk = false;
    private boolean aggiorno = false;

    private EditText eKmTot, eKmParz, ePct;
    private TextView tRis, tInfo;
    private Double ultimoKwh100 = null;

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        caricaDati();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(16), dp(18), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF0A0F1E);
        bg.setCornerRadius(dp(16));
        root.setBackground(bg);

        TextView titolo = new TextView(this);
        titolo.setText("\uD83D\uDD0D Verifica consumo");
        titolo.setTextColor(0xFFE5E7EB);
        titolo.setTextSize(17);
        titolo.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(titolo);

        if (!datiOk) {
            TextView t = new TextView(this);
            t.setText("Apri l'app EVFuel almeno una volta (serve una ricarica salvata con i km totali).");
            t.setTextColor(0xFF9CA3AF);
            t.setTextSize(13);
            t.setPadding(0, dp(12), 0, dp(12));
            root.addView(t);
            root.addView(bottoneChiudi());
            setContentView(root);
            return;
        }

        tInfo = new TextView(this);
        tInfo.setText(String.format(Locale.ITALY, "Ultima ricarica salvata: %,.0f km, batteria al %.0f%%.", kmBase, pctDopo));
        tInfo.setTextColor(0xFF9CA3AF);
        tInfo.setTextSize(12);
        tInfo.setPadding(0, dp(6), 0, dp(10));
        root.addView(tInfo);

        // riga in alto: km totali (sinistra) | km parziali (destra)
        eKmTot = campo();
        eKmParz = campo();
        root.addView(riga(colonna("Km totali", eKmTot), colonna("Km parziali", eKmParz)));

        // riga in basso: batteria (sinistra) | kWh/100km (destra)
        ePct = campo();
        tRis = new TextView(this);
        tRis.setText("\u2014");
        tRis.setTextColor(0xFF38BDF8);
        tRis.setTextSize(20);
        tRis.setTypeface(Typeface.DEFAULT_BOLD);
        tRis.setGravity(Gravity.CENTER_VERTICAL);
        tRis.setPadding(dp(12), 0, dp(12), 0);
        tRis.setBackground(riquadro());
        tRis.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        root.addView(riga(colonna("Batteria attuale (%)", ePct), colonna("kWh/100km", tRis)));

        root.addView(bottoneChiudi());

        eKmTot.addTextChangedListener(new Osserva() {
            @Override
            void cambiato() {
                if (aggiorno) return;
                aggiorno = true;
                Double n = leggi(eKmTot);
                eKmParz.setText(n == null ? "" : String.valueOf(Math.round(Math.max(0, n - kmBase))));
                aggiorno = false;
                ricalcola();
            }
        });
        eKmParz.addTextChangedListener(new Osserva() {
            @Override
            void cambiato() {
                if (aggiorno) return;
                aggiorno = true;
                Double n = leggi(eKmParz);
                eKmTot.setText(n == null ? "" : String.valueOf(Math.round(kmBase + n)));
                aggiorno = false;
                ricalcola();
            }
        });
        ePct.addTextChangedListener(new Osserva() {
            @Override
            void cambiato() {
                ricalcola();
            }
        });

        setContentView(root);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
                | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        eKmTot.requestFocus();
    }

    @Override
    protected void onPause() {
        super.onPause();
        salvaRisultato();
    }

    // ---- logica ----

    private void caricaDati() {
        try {
            SharedPreferences sp = getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(EvfuelWidgetProvider.CHIAVE, null);
            if (s == null) return;
            JSONObject c = new JSONObject(s).optJSONObject("consumo");
            if (c == null) return;
            kmBase = c.optDouble("kmBase", 0);
            pctDopo = c.optDouble("pctDopo", 0);
            batteria = c.optDouble("batteria", 0);
            datiOk = kmBase > 0 && batteria > 0;
        } catch (Exception ignored) {
        }
    }

    private Double leggi(EditText e) {
        try {
            String t = e.getText().toString().trim().replace(',', '.');
            if (t.isEmpty()) return null;
            return Double.parseDouble(t);
        } catch (Exception ex) {
            return null;
        }
    }

    private void ricalcola() {
        Double pct = leggi(ePct);
        Double parz = leggi(eKmParz);
        ultimoKwh100 = null;
        if (pct != null && parz != null && parz > 0) {
            double kwhUsati = ((pctDopo - pct) / 100.0) * batteria;
            if (kwhUsati >= 0) ultimoKwh100 = (kwhUsati / parz) * 100.0;
        }
        tRis.setText(ultimoKwh100 == null ? "\u2014" : String.format(Locale.ITALY, "%.1f", ultimoKwh100));
    }

    private void salvaRisultato() {
        if (!datiOk) return;
        try {
            SharedPreferences sp = getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE);
            if (ultimoKwh100 == null) {
                sp.edit().remove(EvfuelWidgetProvider.RISULTATO).apply();
            } else {
                JSONObject o = new JSONObject();
                o.put("kwh100", ultimoKwh100);
                Double kt = leggi(eKmTot), kp = leggi(eKmParz), pc = leggi(ePct);
                o.put("kmTot", kt == null ? 0 : kt);
                o.put("kmParz", kp == null ? 0 : kp);
                o.put("pct", pc == null ? 0 : pc);
                sp.edit().putString(EvfuelWidgetProvider.RISULTATO, o.toString()).apply();
            }
            EvfuelWidgetProvider.aggiornaTutti(this);
        } catch (Exception ignored) {
        }
    }

    // ---- UI helper ----

    private GradientDrawable riquadro() {
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xFF141B2E);
        g.setStroke(dp(1), 0xFF263149);
        g.setCornerRadius(dp(10));
        return g;
    }

    private EditText campo() {
        EditText e = new EditText(this);
        e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        e.setTextColor(0xFFE5E7EB);
        e.setHintTextColor(0xFF6B7280);
        e.setTextSize(16);
        e.setSingleLine(true);
        e.setPadding(dp(12), 0, dp(12), 0);
        e.setBackground(riquadro());
        e.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        return e;
    }

    private LinearLayout colonna(String etichetta, View v) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        TextView l = new TextView(this);
        l.setText(etichetta);
        l.setTextColor(0xFF9CA3AF);
        l.setTextSize(11);
        l.setPadding(0, 0, 0, dp(3));
        c.addView(l);
        c.addView(v);
        return c;
    }

    private LinearLayout riga(View sx, View dx) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams ps = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        LinearLayout.LayoutParams pd = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        ps.setMargins(0, 0, dp(5), dp(10));
        pd.setMargins(dp(5), 0, 0, dp(10));
        r.addView(sx, ps);
        r.addView(dx, pd);
        return r;
    }

    private TextView bottoneChiudi() {
        TextView t = new TextView(this);
        t.setText("Fatto");
        t.setTextColor(Color.WHITE);
        t.setTextSize(15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xFF0EA5E9);
        g.setCornerRadius(dp(12));
        t.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        lp.topMargin = dp(6);
        t.setLayoutParams(lp);
        t.setOnClickListener(v -> finish());
        return t;
    }

    private abstract static class Osserva implements TextWatcher {
        abstract void cambiato();

        @Override
        public void beforeTextChanged(CharSequence s, int a, int b, int c) {
        }

        @Override
        public void onTextChanged(CharSequence s, int a, int b, int c) {
        }

        @Override
        public void afterTextChanged(Editable s) {
            cambiato();
        }
    }
}
