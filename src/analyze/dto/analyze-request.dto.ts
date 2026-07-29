import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeRequestDto {
  @ApiProperty({
    example: 'dQw4w9WgXcQ',
    description: 'YouTube video ID',
  })
  videoId: string;
}
