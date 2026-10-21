"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Plus, Building2, Loader2 } from "lucide-react";

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    createWorkspace,
    subscriptionCapacity,
  } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const list = Array.isArray(workspaces) ? workspaces : [];
  const ownedCount =
    subscriptionCapacity?.ownedOrganizations ??
    list.filter((w) => w?.role === "owner").length;
  const maxOrgs = subscriptionCapacity?.maxOrganizations ?? null;
  const atCap = maxOrgs != null && ownedCount >= maxOrgs;

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const ws = await createWorkspace(newWorkspaceName);
      setIsDialogOpen(false);
      setNewWorkspaceName("");
      if (ws?.id) await switchWorkspace(ws.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus:outline-none">
          <div className="flex items-center gap-2.5 truncate">
            <Building2 className="size-4 shrink-0 text-primary" />
            <span className="truncate font-medium text-foreground">
              {activeWorkspace?.name || "Select store"}
            </span>
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 bg-popover text-popover-foreground border border-border"
        >
          {/* Base UI MenuGroupLabel must be inside Menu.Group or the page crashes. */}
          <DropdownMenuGroup className="max-h-[160px] overflow-y-auto">
            <DropdownMenuLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Your stores (each has its own WhatsApp)
            </DropdownMenuLabel>
            {list.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No store organization yet.
              </div>
            ) : (
              list.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => {
                    if (ws.id !== activeWorkspace?.id) {
                      void switchWorkspace(ws.id);
                    }
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 focus:bg-accent focus:text-accent-foreground cursor-pointer ${
                    ws.id === activeWorkspace?.id ? "bg-accent/40 font-semibold" : ""
                  }`}
                >
                  <span className="truncate">{ws.name}</span>
                  {ws.role ? (
                    <span className="text-[9px] uppercase tracking-wider bg-primary/10 text-primary px-1 rounded font-medium">
                      {ws.role}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-border" />
          {maxOrgs != null ? (
            <div className="px-3 py-1 text-[10px] text-muted-foreground">
              {ownedCount} of {maxOrgs} stores on your plan
            </div>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              if (atCap) return;
              setIsDialogOpen(true);
            }}
            disabled={atCap}
            className="flex items-center gap-2 px-3 py-2 text-primary focus:bg-accent focus:text-primary cursor-pointer font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="size-4" />
            {atCap ? "Store limit reached" : "Add another store"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-sm bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Add another store
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Each Shopify store gets its own organization and WhatsApp number.
            {maxOrgs != null
              ? ` You are using ${ownedCount} of ${maxOrgs} on your plan.`
              : null}
          </p>
          <form onSubmit={handleCreateWorkspace} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name" className="text-xs text-muted-foreground">
                Store / organization name
              </Label>
              <Input
                id="ws-name"
                type="text"
                placeholder="e.g. Pickle Affair"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                className="bg-muted border-border text-foreground text-xs"
              />
            </div>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="border-border text-muted-foreground text-xs h-8 px-3"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || !newWorkspaceName.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-4 font-semibold"
              >
                {creating ? (
                  <>
                    <Loader2 className="size-3 mr-1 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
