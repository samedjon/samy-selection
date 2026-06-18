import "server-only";
import { v2 as cloudinary } from "cloudinary";

export function isCloudinaryConfigured(): boolean {
  const name = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || "";
  const key = process.env.CLOUDINARY_API_KEY || "";
  const secret = process.env.CLOUDINARY_API_SECRET || "";
  return name !== "" && key !== "" && secret !== ""
    && !name.includes("votre-nom") && !key.includes("votre-api");
}

function getConfig() {
  return {
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || "",
    api_key: process.env.CLOUDINARY_API_KEY || "",
    api_secret: process.env.CLOUDINARY_API_SECRET || ""
  };
}

export async function uploadToCloudinary(
  file: File,
  folder: string
): Promise<{ publicId: string; secureUrl: string; watermarkedUrl: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `samy-production/${folder}`,
        resource_type: "image",
        transformation: [
          { quality: "auto", fetch_format: "auto" }
        ]
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Upload Cloudinary echoue"));
          return;
        }

        const watermarkedUrl = cloudinary.url(result.public_id, {
          transformation: [
            { quality: "auto", fetch_format: "auto" },
            { overlay: process.env.CLOUDINARY_WATERMARK_PUBLIC_ID || "" },
            { flags: "relative", width: 0.5, gravity: "center", opacity: 40 }
          ]
        });

        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          watermarkedUrl
        });
      }
    );

    uploadStream.end(buffer);
  });
}
