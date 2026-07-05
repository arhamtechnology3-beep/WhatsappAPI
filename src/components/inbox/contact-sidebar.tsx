"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface ContactSidebarProps {
  contact: Contact | null;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [shopifyData, setShopifyData] = useState<{
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      orders_count: number;
      total_spent: string;
      currency: string;
      default_address?: {
        city?: string;
        province?: string;
        country?: string;
      };
    } | null;
    orders: Array<{
      id: number;
      name: string;
      order_number: number;
      created_at: string;
      total_price: string;
      currency: string;
      financial_status: string;
      fulfillment_status: string;
      line_items: Array<{
        id: number;
        title: string;
        quantity: number;
        price: string;
      }>;
    }>;
  } | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  // Fetch Shopify Customer Data on contact change
  useEffect(() => {
    if (!contact) {
      setShopifyData(null);
      setShopifyError(null);
      setExpandedOrderId(null);
      return;
    }

    const contactId = contact.id;

    async function fetchShopifyCustomer() {
      setShopifyLoading(true);
      setShopifyError(null);
      try {
        const res = await fetch(`/api/shopify/customer?contactId=${contactId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch Shopify customer details");
        }
        const data = await res.json();
        if (data.success) {
          setShopifyData(data);
        } else {
          setShopifyError(data.error || "Failed to load Shopify customer data");
        }
      } catch (err: unknown) {
        console.error(err);
        const errMsg = err instanceof Error ? err.message : "An error occurred while fetching Shopify data";
        setShopifyError(errMsg);
      } finally {
        setShopifyLoading(false);
      }
    }

    fetchShopifyCustomer();
  }, [contact]);

  const formatCurrency = useCallback((amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency || "₹"}${amount}`;
    }
  }, []);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">Select a conversation</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              Tags
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No tags</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Shopify History Section */}
          <div>
            <div className="flex items-center justify-between px-1 mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                Shopify History
              </span>
              {shopifyLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>

            {shopifyLoading && !shopifyData && (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Fetching Shopify details...
              </div>
            )}

            {shopifyError && (
              <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                {shopifyError}
              </div>
            )}

            {!shopifyLoading && !shopifyError && !shopifyData?.customer && (
              <p className="px-1 text-xs text-muted-foreground">No Shopify customer profile found.</p>
            )}

            {shopifyData?.customer && (
              <div className="space-y-3">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-muted/40 p-2 text-center">
                    <p className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Orders</p>
                    <p className="text-base font-bold text-foreground mt-0.5">
                      {shopifyData.customer.orders_count}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-2 text-center">
                    <p className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Total Spent</p>
                    <p className="text-base font-bold text-foreground mt-0.5">
                      {formatCurrency(Number(shopifyData.customer.total_spent), shopifyData.customer.currency)}
                    </p>
                  </div>
                </div>

                {/* Orders List */}
                {shopifyData.orders.length > 0 && (
                  <div className="space-y-2">
                    <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Orders ({shopifyData.orders.length})
                    </div>
                    <div className="space-y-1.5">
                      {shopifyData.orders.map((order) => {
                        const isExpanded = expandedOrderId === order.id;
                        return (
                          <div
                            key={order.id}
                            className="rounded-lg border border-border bg-muted/10 hover:bg-muted/20 transition-all overflow-hidden"
                          >
                            <button
                              onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                              className="flex w-full items-start justify-between p-2.5 text-left outline-none"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-xs text-foreground">
                                    {order.name}
                                  </span>
                                  <span className={cn(
                                    "rounded-full px-1 py-0.25 text-[8px] font-semibold uppercase tracking-wider",
                                    order.financial_status === "paid" 
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  )}>
                                    {order.financial_status}
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  {format(new Date(order.created_at), "dd MMM yyyy")}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-foreground">
                                  {formatCurrency(Number(order.total_price), order.currency)}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t border-border/60 px-2.5 py-2 space-y-2 bg-muted/5">
                                <div className="space-y-1.5">
                                  <p className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Items</p>
                                  {order.line_items.map((item) => (
                                    <div key={item.id} className="flex justify-between text-xs text-foreground gap-2">
                                      <span className="truncate max-w-[70%]">
                                        {item.quantity} x {item.title}
                                      </span>
                                      <span className="text-muted-foreground shrink-0">
                                        {formatCurrency(Number(item.price) * item.quantity, order.currency)}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border/40 text-[9px]">
                                  <div>
                                    <p className="font-semibold text-muted-foreground uppercase tracking-wider">Fulfillment</p>
                                    <p className="text-foreground capitalize">{order.fulfillment_status || "Unfulfilled"}</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-muted-foreground uppercase tracking-wider">Payment</p>
                                    <p className="text-foreground capitalize">{order.financial_status}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Active Deals
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No deals</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              Notes
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
