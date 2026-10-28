import { Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { LoopMessageListSchema, LoopMessageSchema, NotificationListSchema, NotificationSchema } from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { InboxService } from "./inbox.service.js";

class LoopMessageListDto extends createZodDto(LoopMessageListSchema) {}
class LoopMessageDto extends createZodDto(LoopMessageSchema) {}
class NotificationListDto extends createZodDto(NotificationListSchema) {}
class NotificationDto extends createZodDto(NotificationSchema) {}

@ApiTags("me")
@Controller("me")
export class InboxController {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(InboxService) private readonly inbox: InboxService) {}

  @Get("messages")
  @ApiOperation({ operationId: "listLoopMessages", summary: "One-way messages from the LOOP team" })
  @ApiOkResponse({ type: LoopMessageListDto })
  messages(@CurrentContractor() id: string): Promise<LoopMessageListDto> {
    return this.inbox.messages(id);
  }

  @Post("messages/:messageId/read")
  @HttpCode(200)
  @ApiOperation({ operationId: "markLoopMessageRead" })
  @ApiParam({ name: "messageId", type: String })
  @ApiOkResponse({ type: LoopMessageDto })
  readMessage(@CurrentContractor() id: string, @Param("messageId") messageId: string): Promise<LoopMessageDto> {
    return this.inbox.markMessageRead(id, messageId);
  }

  @Get("notifications")
  @ApiOperation({ operationId: "listNotifications", summary: "System notifications (reminders, confirmations, security)" })
  @ApiOkResponse({ type: NotificationListDto })
  notifications(@CurrentContractor() id: string): Promise<NotificationListDto> {
    return this.inbox.notifications(id);
  }

  @Post("notifications/:notificationId/read")
  @HttpCode(200)
  @ApiOperation({ operationId: "markNotificationRead" })
  @ApiParam({ name: "notificationId", type: String })
  @ApiOkResponse({ type: NotificationDto })
  readNotification(@CurrentContractor() id: string, @Param("notificationId") notificationId: string): Promise<NotificationDto> {
    return this.inbox.markNotificationRead(id, notificationId);
  }
}
