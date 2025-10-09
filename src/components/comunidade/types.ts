export type PollOption = {
  id: string;
  text: string;
  votes: number;
};

export type Poll = {
  question: string;
  options: PollOption[];
  hasVoted?: boolean;
  selectedOptionId?: string;
};

export type Comment = {
  id: string;
  author: string;
  avatar?: string;
  text: string;
  createdAt: string;
};

export type Post = {
  id: string;
  author: string;
  avatar?: string;
  title?: string;
  content: string;
  images?: string[];
  poll?: Poll | null;
  likes: number;
  comments: Comment[];
  reposts: number;
  pinned?: boolean;
  saved?: boolean;
  likedByUser?: boolean;
  repostedByUser?: boolean;
  repostOf?: { id: string; author: string };
  createdAt: string;
};

export type Event = {
  id: string;
  title: string;
  date: string;
  location?: string;
  description?: string;
};

export type Group = {
  id: string;
  name: string;
  members: string[];
};