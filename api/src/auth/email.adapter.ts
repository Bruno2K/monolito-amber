import { Injectable } from "@nestjs/common";

export interface OutboundEmail {
  to: string;
  subject: string;
  template: "password-reset" | "organization-invite";
  token: string;
}

@Injectable()
export class EmailAdapter {
  readonly sent: OutboundEmail[] = [];

  async send(message: OutboundEmail): Promise<void> {
    this.sent.push(message);
  }
}
