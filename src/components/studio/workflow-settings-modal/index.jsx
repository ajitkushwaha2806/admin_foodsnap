"use client";

import React, { useState, useEffect } from "react";
import { Server, Save, CheckCircle2, AlertCircle, RefreshCw, Sliders, Cpu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ComfyUIService } from "@/services/frontend/comfyui";

export function WorkflowSettingsModal({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) {
  const [tempConfig, setTempConfig] = useState(config);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    setTempConfig(config);
    setTestResult(null);
  }, [config, isOpen]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const stats = await ComfyUIService.getSystemStats(tempConfig.serverUrl);
      const gpuName = stats.devices?.[0]?.name || "Active (Direct/MPS/CPU)";
      setTestResult({
        success: true,
        message: `Connected successfully! Device: ${gpuName}`,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: `Connection failed: ${err.message || "Server unreachable"}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSaveConfig(tempConfig);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sliders className="w-5 h-5 text-orange-500" />
            <DialogTitle>Workflow & ComfyUI Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure ComfyUI backend server endpoint, distilled sampling steps, and Flux.2 Klein parameters.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 text-sm">
          {/* Server URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">ComfyUI Server Endpoint</Label>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="text-[11px] text-orange-400 hover:text-orange-300 underline inline-flex items-center gap-1"
              >
                {isTesting ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Server className="h-3 w-3" />
                )}
                Test Connection
              </button>
            </div>
            <Input
              value={tempConfig.serverUrl}
              onChange={(e) => setTempConfig({ ...tempConfig, serverUrl: e.target.value })}
              placeholder="http://127.0.0.1:8188"
              className="font-mono text-xs h-9"
            />

            {testResult && (
              <div
                className={`mt-1.5 flex items-center gap-2 rounded-lg p-2 text-xs ${
                  testResult.success
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Prompt Template */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Default Prompt Template</Label>
            <Textarea
              value={tempConfig.promptTemplate}
              onChange={(e) => setTempConfig({ ...tempConfig, promptTemplate: e.target.value })}
              rows={3}
              placeholder="Prompt template for generation..."
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Tip: <code className="text-orange-400">{"{subject}"}</code> will be replaced automatically by the dish name.
            </p>
          </div>

          {/* Model Weights Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">UNET / DiT Model (GGUF)</Label>
              <Input
                value={tempConfig.unetName}
                onChange={(e) => setTempConfig({ ...tempConfig, unetName: e.target.value })}
                className="font-mono text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">CLIP Text Model</Label>
              <Input
                value={tempConfig.clipName}
                onChange={(e) => setTempConfig({ ...tempConfig, clipName: e.target.value })}
                className="font-mono text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">VAE Model</Label>
              <Input
                value={tempConfig.vaeName}
                onChange={(e) => setTempConfig({ ...tempConfig, vaeName: e.target.value })}
                className="font-mono text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Distilled Steps</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={tempConfig.steps}
                onChange={(e) => setTempConfig({ ...tempConfig, steps: parseInt(e.target.value) || 4 })}
                className="font-mono text-xs h-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Subject Megapixels</Label>
              <Input
                type="number"
                step="0.05"
                min={0.1}
                max={2.0}
                value={tempConfig.subjectMegapixels}
                onChange={(e) => setTempConfig({ ...tempConfig, subjectMegapixels: parseFloat(e.target.value) || 0.45 })}
                className="font-mono text-xs h-8"
              />
              <p className="text-[10px] text-muted-foreground">Default: 0.45 MP (Fast & crisp)</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Background Megapixels</Label>
              <Input
                type="number"
                step="0.05"
                min={0.1}
                max={2.0}
                value={tempConfig.backgroundMegapixels}
                onChange={(e) => setTempConfig({ ...tempConfig, backgroundMegapixels: parseFloat(e.target.value) || 0.3 })}
                className="font-mono text-xs h-8"
              />
              <p className="text-[10px] text-muted-foreground">Default: 0.30 MP (Low VRAM footprint)</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="bg-orange-600 hover:bg-orange-500 text-white">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
