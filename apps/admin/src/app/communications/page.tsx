"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Mail, Megaphone, Clock } from "lucide-react";
import { SendPushTab } from "@/components/communications/SendPushTab";
import { SendEmailTab } from "@/components/communications/SendEmailTab";
import { BroadcastTab } from "@/components/communications/BroadcastTab";
import { ScheduledTab } from "@/components/communications/ScheduledTab";
import { HistoryTab } from "@/components/communications/HistoryTab";

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Communications</h1>

      <Tabs defaultValue="push">
        <TabsList>
          <TabsTrigger value="push">
            <Send className="h-4 w-4 mr-1" />
            Send Push
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="h-4 w-4 mr-1" />
            Send Email
          </TabsTrigger>
          <TabsTrigger value="broadcast">
            <Megaphone className="h-4 w-4 mr-1" />
            Broadcast
          </TabsTrigger>
          <TabsTrigger value="scheduled">
            <Clock className="h-4 w-4 mr-1" />
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="push"><SendPushTab /></TabsContent>
        <TabsContent value="email"><SendEmailTab /></TabsContent>
        <TabsContent value="broadcast"><BroadcastTab /></TabsContent>
        <TabsContent value="scheduled"><ScheduledTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}
