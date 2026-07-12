"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
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
  const { workspaces, activeWorkspace, switchWorkspace, createWorkspace } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const ws = await createWorkspace(newWorkspaceName);
      setIsDialogOpen(false);
      setNewWorkspaceName("");
      // Switch to new workspace
      await switchWorkspace(ws.id);
    } catch (err: any) {
      setError(err.message || "Failed to create workspace");
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
              {activeWorkspace?.name || "Select Workspace"}
            </span>
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 bg-popover text-popover-foreground border border-border">
          <DropdownMenuLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <div className="max-h-[160px] overflow-y-auto">
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => {
                  if (ws.id !== activeWorkspace?.id) {
                    switchWorkspace(ws.id);
                  }
                }}
                className={`flex items-center justify-between px-3 py-1.5 focus:bg-accent focus:text-accent-foreground cursor-pointer ${
                  ws.id === activeWorkspace?.id ? "bg-accent/40 font-semibold" : ""
                }`}
              >
                <span className="truncate">{ws.name}</span>
                {ws.role && (
                  <span className="text-[9px] uppercase tracking-wider bg-primary/10 text-primary px-1 rounded font-medium">
                    {ws.role}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-primary focus:bg-accent focus:text-primary cursor-pointer font-semibold"
          >
            <Plus className="size-4" />
            Create Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-sm bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Create New Workspace
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateWorkspace} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name" className="text-xs text-muted-foreground">
                Workspace Name
              </Label>
              <Input
                id="ws-name"
                type="text"
                placeholder="e.g. Acme Corp"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                className="bg-muted border-border text-foreground text-xs"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
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
