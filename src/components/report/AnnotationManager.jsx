import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, Edit, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AnnotationManager({ organizationId, dateRange = null, compact = false }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    annotation_date: '',
    annotation_type: 'other',
    visibility: 'internal',
    color: 'blue'
  });

  // Fetch annotations
  const { data: annotations } = useQuery({
    queryKey: ['annotations', organizationId, dateRange],
    queryFn: async () => {
      if (!organizationId || organizationId === 'all') return [];
      const all = await base44.entities.Annotation.filter(
        { organization_id: organizationId },
        '-annotation_date'
      );

      // Filter by date range if provided
      if (dateRange?.from && dateRange?.to) {
        return all.filter(ann => {
          const annDate = new Date(ann.annotation_date);
          return annDate >= dateRange.from && annDate <= dateRange.to;
        });
      }

      return all;
    },
    initialData: []
  });

  // Create/Update annotation
  const saveAnnotationMutation = useMutation({
    mutationFn: async (data) => {
      if (editingAnnotation) {
        return await base44.entities.Annotation.update(editingAnnotation.id, data);
      } else {
        return await base44.entities.Annotation.create({
          ...data,
          organization_id: organizationId
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] });
      toast.success(editingAnnotation ? 'Annotation updated' : 'Annotation created');
      setShowDialog(false);
      resetForm();
    }
  });

  // Delete annotation
  const deleteAnnotationMutation = useMutation({
    mutationFn: (id) => base44.entities.Annotation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] });
      toast.success('Annotation deleted');
    }
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      annotation_date: '',
      annotation_type: 'other',
      visibility: 'internal',
      color: 'blue'
    });
    setEditingAnnotation(null);
  };

  const handleEdit = (annotation) => {
    setEditingAnnotation(annotation);
    setFormData({
      title: annotation.title,
      description: annotation.description || '',
      annotation_date: annotation.annotation_date,
      annotation_type: annotation.annotation_type,
      visibility: annotation.visibility,
      color: annotation.color
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!formData.title || !formData.annotation_date) {
      toast.error('Title and date are required');
      return;
    }

    saveAnnotationMutation.mutate(formData);
  };

  const getTypeLabel = (type) => {
    const labels = {
      campaign_launch: 'Campaign Launch',
      campaign_end: 'Campaign End',
      website_change: 'Website Change',
      holiday: 'Holiday',
      promotion: 'Promotion',
      external_event: 'External Event',
      data_issue: 'Data Issue',
      other: 'Other'
    };
    return labels[type] || type;
  };

  const getColorClass = (color) => {
    const colors = {
      blue: 'bg-blue-100 text-blue-800 border-blue-300',
      green: 'bg-green-100 text-green-800 border-green-300',
      red: 'bg-red-100 text-red-800 border-red-300',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      purple: 'bg-purple-100 text-purple-800 border-purple-300',
      orange: 'bg-orange-100 text-orange-800 border-orange-300'
    };
    return colors[color] || colors.blue;
  };

  // Compact view for sidebars
  if (compact) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Annotations ({annotations.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowDialog(true)}>
            <Plus className="w-3 h-3" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {annotations.slice(0, 5).map(ann => (
            <div key={ann.id} className={`p-2 rounded border ${getColorClass(ann.color)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{ann.title}</p>
                  <p className="text-xs opacity-75">{format(new Date(ann.annotation_date), 'MMM d, yyyy')}</p>
                </div>
                {ann.visibility === 'client_facing' && (
                  <Badge variant="secondary" className="text-xs">Client</Badge>
                )}
              </div>
            </div>
          ))}
          {annotations.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">No annotations</p>
          )}
        </CardContent>
        
        {/* Dialog */}
        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) resetForm();
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAnnotation ? 'Edit' : 'Add'} Annotation</DialogTitle>
              <DialogDescription>
                Mark important events that affect your data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Summer Campaign Launch"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Additional details about this event..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.annotation_date}
                    onChange={(e) => setFormData({ ...formData, annotation_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.annotation_type}
                    onValueChange={(value) => setFormData({ ...formData, annotation_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="campaign_launch">Campaign Launch</SelectItem>
                      <SelectItem value="campaign_end">Campaign End</SelectItem>
                      <SelectItem value="website_change">Website Change</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="promotion">Promotion</SelectItem>
                      <SelectItem value="external_event">External Event</SelectItem>
                      <SelectItem value="data_issue">Data Issue</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="visibility">Visibility</Label>
                  <Select
                    value={formData.visibility}
                    onValueChange={(value) => setFormData({ ...formData, visibility: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal Only</SelectItem>
                      <SelectItem value="client_facing">Client Facing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <Select
                    value={formData.color}
                    onValueChange={(value) => setFormData({ ...formData, color: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blue">Blue</SelectItem>
                      <SelectItem value="green">Green</SelectItem>
                      <SelectItem value="red">Red</SelectItem>
                      <SelectItem value="yellow">Yellow</SelectItem>
                      <SelectItem value="purple">Purple</SelectItem>
                      <SelectItem value="orange">Orange</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowDialog(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saveAnnotationMutation.isPending}>
                {saveAnnotationMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  // Full view for dedicated page
  return null;
}