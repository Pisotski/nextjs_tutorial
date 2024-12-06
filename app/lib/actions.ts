"use server";

import { z } from "zod";
import { sql } from "@vercel/postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

const FormSchema = z.object({
	id: z.string(),
	customerId: z.string({
		invalid_type_error: "Please select a customer.",
	}),
	amount: z.coerce
		.number()
		.gt(0, { message: "Please enter an amount greater than $0." }),
	status: z.enum(["pending", "paid"], {
		invalid_type_error: "Please select an invoice status.",
	}),
	date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
	errors?: {
		customerId?: string[];
		amount?: string[];
		status?: string[];
	};
	message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
	const validatedFields = CreateInvoice.safeParse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	});

	// If form validation fails, return errors early. Otherwise, continue.
	if (!validatedFields.success) {
		return {
			errors: validatedFields.error.flatten().fieldErrors,
			message: "Missing Fields. Failed to Create Invoice.",
		};
	}

	// Prepare data for insertion into the database
	const { customerId, amount, status } = validatedFields.data;

	/*	It's usually good practice to store monetary values in cents in your
	 *	database to eliminate JavaScript floating-point errors
	 *	and ensure greater accuracy.	*/

	const amountInCents = amount * 100;
	const date = new Date().toISOString().split("T")[0];

	try {
		await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
  `;
	} catch (error) {
		return {
			message: "Database Error: Failed to Create Invoice.",
		};
	}

	revalidatePath("/dashboard/invoices");

	/*	Note how redirect is being called outside of the try/catch block.
	 *	This is because redirect works by throwing an error,
	 *	which would be caught by the catch block.
	 *	To avoid this, you can call redirect after try/catch */

	redirect("/dashboard/invoices");
}

// Use Zod to update the expected types
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

// ...

export async function updateInvoice(id: string, formData: FormData) {
	const { customerId, amount, status } = UpdateInvoice.parse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	});

	const amountInCents = amount * 100;

	try {
		await sql`
		  UPDATE invoices
		  SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
		  WHERE id = ${id}
		`;
	} catch (error) {
		return { message: "Database Error: Failed to Update Invoice." };
	}

	revalidatePath("/dashboard/invoices");
	redirect("/dashboard/invoices");
}

export async function deleteInvoice(id: string) {
	try {
		await sql`DELETE FROM invoices WHERE id = ${id}`;
		revalidatePath("/dashboard/invoices");
		return { message: "Deleted Invoice." };
	} catch (error) {
		return { message: "Database Error: Failed to Delete Invoice." };
	}
}

export async function authenticate(
	prevState: string | undefined,
	formData: FormData
) {
	try {
		await signIn("credentials", formData);
	} catch (error) {
		if (error instanceof AuthError) {
			switch (error.type) {
				case "CredentialsSignin":
					return "Invalid credentials.";
				default:
					return "Something went wrong.";
			}
		}
		throw error;
	}
}
