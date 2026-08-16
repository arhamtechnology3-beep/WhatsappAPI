"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronRight,
  LayoutTemplate,
  Loader2,
} from "lucide-react";
import { extractVariableIndices } from "@/lib/whatsapp/template-validators";
import {
  WhatsAppTemplatePreview,
  fillTemplatePlaceholders,
} from "@/components/whatsapp/whatsapp-template-preview";
import {
  COLLECTION_ALL_PRODUCTS_PATH,
  defaultHeaderImageUrl,
  urlButtonParamFromAbsolute,
} from "@/lib/shopify/whatsapp-template-library";

export interface TemplateSendValues {
  body: string[];
  headerText?: string;
  headerMediaUrl?: string;
  buttonParams?: Record<number, string>;
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
  contactName?: string | null;
  contactId?: string | null;
}

interface UrlButtonSlot {
  index: number;
  text: string;
  url: string;
}

/**
 * Templates may need values for: body variables, a text-header
 * variable, and per-URL-button suffixes. Collect them all so the
 * send-message path doesn't 400 on missing parameters.
 */
function collectVariableSlots(template: MessageTemplate): {
  bodyVars: number[];
  headerVarCount: number;
  urlButtonSlots: UrlButtonSlot[];
} {
  const bodyVars = extractVariableIndices(template.body_text);
  const headerVarCount =
    template.header_type === "text" && template.header_content
      ? extractVariableIndices(template.header_content).length
      : 0;
  const urlButtonSlots: UrlButtonSlot[] = [];
  (template.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url).length > 0) {
      urlButtonSlots.push({ index: i, text: b.text, url: b.url });
    }
  });
  return { bodyVars, headerVarCount, urlButtonSlots };
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
  contactName,
  contactId,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState<string>("");
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  const [storeContext, setStoreContext] = useState<{
    customerFirstName: string;
    productName: string;
    totalPrice: string;
    checkoutUrl: string;
    storeName: string;
    dynamicOffer: string;
    discountCode: string;
    orderNumber: string;
    trackingUrl: string;
  }>({
    customerFirstName: "",
    productName: "",
    totalPrice: "",
    checkoutUrl: "",
    storeName: "DivyaPrabha Foods",
    dynamicOffer: "🎁 10% DISCOUNT & FREE SHIPPING!",
    discountCode: "WELCOME10",
    orderNumber: "#1001",
    trackingUrl: "",
  });

  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    const supabase = createClient();
    const customerName = contactName ? (contactName.split(" ")[0] || contactName) : "";

    async function fetchStoreContext() {
      let fetchedFirstName = customerName;
      let fetchedProduct = "";
      let fetchedTotalPrice = 0;
      let fetchedCheckoutUrl = "";
      let fetchedDiscountCode = "";
      let fetchedOrderNumber = "";
      let fetchedTrackingUrl = "";

      // 1. Fetch Contact info if missing first name
      if (contactId && !fetchedFirstName) {
        const { data: contactRow } = await supabase
          .from("contacts")
          .select("name")
          .eq("id", contactId)
          .maybeSingle();
        if (contactRow?.name) {
          fetchedFirstName = contactRow.name.split(" ")[0] || contactRow.name;
        }
      }

      // 2. Fetch latest Checkout
      if (contactId) {
        const { data: checkout } = await supabase
          .from("shopify_checkouts")
          .select("line_items, total_price, abandoned_checkout_url, discount_code")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (checkout) {
          if (Array.isArray(checkout.line_items) && checkout.line_items.length > 0) {
            fetchedProduct = checkout.line_items[0]?.title || "";
          }
          if (checkout.total_price) {
            fetchedTotalPrice = Number(checkout.total_price);
          }
          if (checkout.abandoned_checkout_url) {
            fetchedCheckoutUrl = checkout.abandoned_checkout_url.replace(
              "divyaprabhafoods.myshopify.com",
              "divyaprabhafoods.com"
            );
          }
          if (checkout.discount_code) {
            fetchedDiscountCode = checkout.discount_code;
          }
        }
      }

      // 3. Fetch latest Order if product or details still empty
      if (contactId && (!fetchedProduct || !fetchedTotalPrice)) {
        const { data: order } = await supabase
          .from("shopify_orders")
          .select("line_items, total_price, order_number, name, tracking_url")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (order) {
          if (!fetchedProduct && Array.isArray(order.line_items) && order.line_items.length > 0) {
            fetchedProduct = order.line_items[0]?.title || "";
          }
          if (!fetchedTotalPrice && order.total_price) {
            fetchedTotalPrice = Number(order.total_price);
          }
          if (order.name || order.order_number) {
            fetchedOrderNumber = order.name || `#${order.order_number}`;
          }
          if (order.tracking_url) {
            fetchedTrackingUrl = order.tracking_url;
          }
        }
      }

      // 4. Calculate dynamic offer based on cart price
      let dynamicOffer = "🎁 10% DISCOUNT & FREE SHIPPING!";
      if (fetchedTotalPrice >= 749) {
        dynamicOffer = "🎉 10% Discount & FREE Shipping auto-applied at checkout!";
      } else if (fetchedTotalPrice >= 599) {
        dynamicOffer = `🚚 FREE Shipping auto-applied at checkout! (Add items worth ₹${749 - fetchedTotalPrice} for 10% OFF)`;
      } else if (fetchedTotalPrice > 0) {
        dynamicOffer = `✨ Add items worth ₹${599 - fetchedTotalPrice} to get FREE Shipping & ₹${749 - fetchedTotalPrice} for 10% OFF!`;
      }

      if (isMounted) {
        setStoreContext({
          customerFirstName: fetchedFirstName || "Customer",
          productName: fetchedProduct || "your cart items",
          totalPrice: fetchedTotalPrice > 0 ? `₹${fetchedTotalPrice}` : "₹500",
          checkoutUrl: fetchedCheckoutUrl || "https://divyaprabhafoods.com/",
          storeName: "DivyaPrabha Foods",
          dynamicOffer,
          discountCode: fetchedDiscountCode || "WELCOME10",
          orderNumber: fetchedOrderNumber || "#1001",
          trackingUrl: fetchedTrackingUrl || fetchedCheckoutUrl || "https://divyaprabhafoods.com/",
        });
      }
    }

    fetchStoreContext();

    return () => {
      isMounted = false;
    };
  }, [open, contactId, contactName]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch templates:", error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function resetSelection() {
    setSelected(null);
    setParams([]);
    setHeaderText("");
    setButtonParams({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    const slots = collectVariableSlots(template);
    const initialParams = new Array(slots.bodyVars.length).fill("");
    const tn = template.name || "";

    // 1. Explicit Preset Template Mappings
    if (tn === "wacrm_cart_abandoned_v3") {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.productName;
      if (slots.bodyVars.length >= 3) initialParams[2] = storeContext.dynamicOffer;
    } else if (tn === "wacrm_cart_abandoned_v2") {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.productName;
    } else if (tn === "wacrm_cart_abandoned_v1" || tn.includes("cart_abandoned")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.productName;
    } else if (tn.includes("cart_reminder_step2")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.productName;
    } else if (tn.includes("cart_reminder_step3")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.productName;
      if (slots.bodyVars.length >= 3) initialParams[2] = storeContext.discountCode;
    } else if (tn.includes("browse_abandoned")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.productName;
    } else if (tn.includes("order_confirmed")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.orderNumber;
      if (slots.bodyVars.length >= 3) initialParams[2] = storeContext.totalPrice;
    } else if (tn.includes("order_shipped")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.orderNumber;
    } else if (tn.includes("order_delivered")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.orderNumber;
    } else if (tn.includes("cod_confirmation")) {
      if (slots.bodyVars.length >= 1) initialParams[0] = storeContext.customerFirstName;
      if (slots.bodyVars.length >= 2) initialParams[1] = storeContext.orderNumber;
      if (slots.bodyVars.length >= 3) initialParams[2] = storeContext.totalPrice;
    } else {
      // 2. Intelligent Context-Aware Resolver for any template
      const text = template.body_text || "";
      slots.bodyVars.forEach((varIndex, idx) => {
        const placeholder = `{{${varIndex}}}`;
        const pIdx = text.indexOf(placeholder);
        const snippet = pIdx !== -1
          ? text.slice(Math.max(0, pIdx - 40), Math.min(text.length, pIdx + 40))
          : "";

        if (/name|hey|hi|hello|dear|customer/i.test(snippet)) {
          initialParams[idx] = storeContext.customerFirstName;
        } else if (/product|item|cart|checking out|buying|bought|order/i.test(snippet)) {
          initialParams[idx] = storeContext.productName;
        } else if (/offer|discount|deal|shipping|special|gift|free/i.test(snippet)) {
          initialParams[idx] = storeContext.dynamicOffer;
        } else if (/price|total|amount|cost|rs|₹|\$/i.test(snippet)) {
          initialParams[idx] = storeContext.totalPrice;
        } else if (/checkout|link|url|website|visit/i.test(snippet)) {
          initialParams[idx] = storeContext.checkoutUrl;
        } else if (/code|coupon|voucher/i.test(snippet)) {
          initialParams[idx] = storeContext.discountCode;
        } else if (/store|shop|brand|company/i.test(snippet)) {
          initialParams[idx] = storeContext.storeName;
        } else if (/track|shipment|courier/i.test(snippet)) {
          initialParams[idx] = storeContext.trackingUrl;
        } else {
          // Fallback sequence by index
          if (idx === 0) initialParams[idx] = storeContext.customerFirstName;
          else if (idx === 1) initialParams[idx] = storeContext.productName;
          else if (idx === 2) initialParams[idx] = storeContext.dynamicOffer;
          else if (idx === 3) initialParams[idx] = storeContext.checkoutUrl;
          else if (idx === 4) initialParams[idx] = storeContext.storeName;
          else initialParams[idx] = "";
        }
      });
    }

    // Header variable auto-fill
    let initialHeader = "";
    if (slots.headerVarCount > 0 && template.header_content) {
      const hContent = template.header_content;
      if (/name|customer|hey|hi/i.test(hContent)) {
        initialHeader = storeContext.customerFirstName;
      } else if (/product|item|cart/i.test(hContent)) {
        initialHeader = storeContext.productName;
      } else {
        initialHeader = storeContext.storeName;
      }
    }

    // Button URL variables auto-fill — Meta wants the path after the
    // registered origin (`checkouts/cn/…`), never a full URL or coupon.
    const initialButtonParams: Record<number, string> = {};
    slots.urlButtonSlots.forEach((s) => {
      const haystack = `${s.text} ${s.url}`;
      if (/complete purchase|checkout|cart|purchase/i.test(haystack)) {
        initialButtonParams[s.index] =
          urlButtonParamFromAbsolute(storeContext.checkoutUrl) || "checkouts";
      } else if (/order now|product/i.test(haystack)) {
        initialButtonParams[s.index] = COLLECTION_ALL_PRODUCTS_PATH;
      } else {
        initialButtonParams[s.index] =
          urlButtonParamFromAbsolute(storeContext.checkoutUrl) ||
          COLLECTION_ALL_PRODUCTS_PATH;
      }
    });

    const noInputsNeeded =
      slots.bodyVars.length === 0 &&
      slots.headerVarCount === 0 &&
      slots.urlButtonSlots.length === 0;
    const headerMediaUrl =
      template.header_media_url ||
      (template.header_type === "image" ||
      template.header_type === "video" ||
      template.header_type === "document"
        ? defaultHeaderImageUrl()
        : undefined);
    if (noInputsNeeded) {
      onSelect(template, {
        body: initialParams,
        headerMediaUrl,
      });
      handleOpenChange(false);
      return;
    }
    setSelected(template);
    setParams(initialParams);
    setHeaderText(initialHeader);
    setButtonParams(initialButtonParams);
  }

  function confirm() {
    if (!selected) return;
    const values: TemplateSendValues = { body: params };
    if (headerText.trim()) values.headerText = headerText.trim();
    if (Object.keys(buttonParams).length > 0) {
      values.buttonParams = Object.fromEntries(
        Object.entries(buttonParams).map(([k, v]) => [Number(k), v.trim()]),
      );
    }
    values.headerMediaUrl =
      selected.header_media_url ||
      (selected.header_type === "image" ||
      selected.header_type === "video" ||
      selected.header_type === "document"
        ? defaultHeaderImageUrl()
        : undefined);
    onSelect(selected, values);
    handleOpenChange(false);
  }

  const slots = useMemo(
    () => (selected ? collectVariableSlots(selected) : null),
    [selected],
  );
  const canConfirm =
    !!selected &&
    !!slots &&
    slots.bodyVars.every((_, i) => (params[i] ?? "").trim().length > 0) &&
    (slots.headerVarCount === 0 || headerText.trim().length > 0) &&
    slots.urlButtonSlots.every(
      (s) => (buttonParams[s.index] ?? "").trim().length > 0,
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {selected ? selected.name : "Send template"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected
              ? "Fill in the placeholders to render this template. Meta requires every variable to be set."
              : "Pick an approved WhatsApp template to send to this contact."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                <p className="text-sm text-popover-foreground">No approved templates</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Approve a template in Meta WhatsApp Manager, then sync it
                  from Settings → Templates.
                </p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className="w-full rounded-md border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-popover"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-popover-foreground">
                          {t.name}
                        </p>
                        <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                          {t.category}
                        </Badge>
                        {t.language && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {t.language}
                          </span>
                        )}
                      </div>
                      <WhatsAppTemplatePreview template={t} compact className="mt-2" />
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                How it looks to the customer
              </p>
              <WhatsAppTemplatePreview
                template={selected}
                bodyText={fillTemplatePlaceholders(selected.body_text, params)}
                headerText={headerText || undefined}
                headerMediaUrl={
                  selected.header_media_url ||
                  (selected.header_type === "image"
                    ? defaultHeaderImageUrl()
                    : undefined)
                }
              />
            </div>
            {slots && slots.headerVarCount > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`Header {{1}}`}
                </Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Value for the header variable"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
            {slots?.bodyVars.map((v, i) => (
              <div key={v} className="space-y-1">
                <Label className="text-xs text-popover-foreground">{`Body {{${v}}}`}</Label>
                <Input
                  value={params[i] ?? ""}
                  onChange={(e) => {
                    const next = [...params];
                    next[i] = e.target.value;
                    setParams(next);
                  }}
                  placeholder={`Value for {{${v}}}`}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}
            {slots?.urlButtonSlots.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`URL button "${slot.text}" — value for `}{`{{1}}`}
                </Label>
                <Input
                  value={buttonParams[slot.index] ?? ""}
                  onChange={(e) =>
                    setButtonParams((prev) => ({
                      ...prev,
                      [slot.index]: e.target.value,
                    }))
                  }
                  placeholder="URL suffix value"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-[10px] text-muted-foreground break-all">
                  Final URL: {slot.url.replace(/\{\{1\}\}/g, buttonParams[slot.index] || "{{1}}")}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                disabled={!canConfirm}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Send template
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
