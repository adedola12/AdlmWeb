// server/util/allModels.js
//
// Every model the app defines, imported for its side effect of registering
// with mongoose. Used by the index job (util/indexSync.js) so it can build the
// indexes of ALL models, not just the few a scheduled job happens to import.
//
// Static imports on purpose: the Lambda bundles are single files built by
// esbuild, so reading the models/ directory at runtime would find nothing.
// allModels.test.js fails when a file in models/ is missing from this list.
//
// demoTenancy.js and tenancy.bootstrap.js are deliberately absent: they are a
// plugin, not models, and the plugin adds no indexes.
import "../models/ActivityLog.js";
import "../models/AgentConversation.js";
import "../models/AiAllocation.js";
import "../models/AiUsage.js";
import "../models/ArchicadBoqVersion.js";
import "../models/AuditLog.js";
import "../models/BillboardSlide.js";
import "../models/Broadcast.js";
import "../models/Campaign.js";
import "../models/CategoryFeedback.js";
import "../models/Changelog.js";
import "../models/ClientNetError.js";
import "../models/Coupon.js";
import "../models/CourseEnrollment.js";
import "../models/CourseSubmission.js";
import "../models/DiagnosticLog.js";
import "../models/EmailSend.js";
import "../models/EmailTemplate.js";
import "../models/Flyer.js";
import "../models/FollowUp.js";
import "../models/FreeVideoWatch.js";
import "../models/Freebie.js";
import "../models/HelpBotLog.js";
import "../models/Invoice.js";
import "../models/Lead.js";
import "../models/Learn.js";
import "../models/LessonNote.js";
import "../models/MailEvent.js";
import "../models/MaterialConstantProfile.js";
import "../models/ModelCheck.js";
import "../models/OrgVideo.js";
import "../models/PTrainingEnrollment.js";
import "../models/PTrainingEvent.js";
import "../models/PaidCourse.js";
import "../models/PasswordReset.js";
import "../models/PlaybackSession.js";
import "../models/Product.js";
import "../models/ProductDeployment.js";
import "../models/Proposal.js";
import "../models/Purchase.js";
import "../models/Quiz.js";
import "../models/RateGenComputeItem.js";
import "../models/RateGenLabour.js";
import "../models/RateGenLibrary.js";
import "../models/RateGenMaterial.js";
import "../models/RateGenMeta.js";
import "../models/RateGenRate.js";
import "../models/Refresh.js";
import "../models/Referral.js";
import "../models/ReleaseBatch.js";
import "../models/ReleaseCandidate.js";
import "../models/ReleaseGateConfig.js";
import "../models/ReleaseNotice.js";
import "../models/Role.js";
import "../models/RoleAudit.js";
import "../models/SavedDocument.js";
import "../models/ServiceConstant.js";
import "../models/Setting.js";
import "../models/Showcase.js";
import "../models/SignupThrottle.js";
import "../models/Software.js";
import "../models/StepUpOtp.js";
import "../models/SupportTicket.js";
import "../models/TakeoffBaseline.js";
import "../models/TakeoffCalibration.js";
import "../models/TakeoffProject.js";
import "../models/TakeoffSession.js";
import "../models/TaskLinkLearned.js";
import "../models/TemplateRequest.js";
import "../models/TimeMgtTask.js";
import "../models/Training.js";
import "../models/TrainingEnrollment.js";
import "../models/TrainingEvent.js";
import "../models/TrainingLocation.js";
import "../models/UsageSession.js";
import "../models/User.js";
import "../models/Video.js";
import "../models/WaitlistEntry.js";
import "../models/WorkItem.js";
